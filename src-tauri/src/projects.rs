//! Read-only project identity resolution from working directories and Git metadata.

use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader},
    path::{Component, Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectIdentity {
    pub key: String,
    pub name: String,
}

/// Caches lookups by working directory for the duration of a scan.
#[derive(Default)]
pub struct ProjectResolver {
    cache: HashMap<PathBuf, ProjectIdentity>,
}

impl ProjectResolver {
    pub fn resolve(&mut self, cwd: &str) -> ProjectIdentity {
        let directory = absolute_path(cwd);
        if let Some(identity) = self.cache.get(&directory) {
            return identity.clone();
        }
        let identity = resolve_uncached(cwd, &directory);
        self.cache.insert(directory, identity.clone());
        identity
    }
}

fn resolve_uncached(cwd: &str, directory: &Path) -> ProjectIdentity {
    let path_identity = format!("path:{}", normalize_path(directory));
    let fallback_name = path_name(cwd);
    if cwd.trim().is_empty() {
        return ProjectIdentity {
            key: path_identity,
            name: fallback_name,
        };
    }
    let Some((root, git_dir)) = find_repository(directory) else {
        return ProjectIdentity {
            key: path_identity,
            name: fallback_name,
        };
    };

    // HEAD is read along with the other repository metadata. It is informational here; a
    // detached HEAD and an unreadable HEAD still identify the same repository.
    let _head = read_first_line(&git_dir.join("HEAD"));
    let remote = read_origin_url(&git_dir.join("config"));
    if let Some((identity, name)) = remote.as_deref().and_then(normalize_remote) {
        return ProjectIdentity {
            key: format!("git:{identity}"),
            name,
        };
    }

    let normalized_root = normalize_path(&root);
    ProjectIdentity {
        key: format!("git:{normalized_root}"),
        name: root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or(fallback_name),
    }
}

fn find_repository(directory: &Path) -> Option<(PathBuf, PathBuf)> {
    for ancestor in directory.ancestors() {
        let marker = ancestor.join(".git");
        if marker.is_dir() {
            let _head = read_first_line(&marker.join("HEAD"));
            return Some((ancestor.to_path_buf(), marker));
        }
        if !marker.is_file() {
            continue;
        }
        let pointer = read_first_line(&marker)?;
        let target = pointer.strip_prefix("gitdir:")?.trim();
        if target.is_empty() {
            continue;
        }
        let git_dir = absolute_from(marker.parent()?, target);
        let common_dir = read_first_line(&git_dir.join("commondir"))
            .filter(|value| !value.trim().is_empty())
            .map(|value| absolute_from(&git_dir, value.trim()))
            .unwrap_or_else(|| git_dir.clone());
        let root = common_dir
            .file_name()
            .is_some_and(|name| name == ".git")
            .then(|| common_dir.parent().map(Path::to_path_buf))
            .flatten()
            .unwrap_or_else(|| ancestor.to_path_buf());
        let _head = read_first_line(&common_dir.join("HEAD"))
            .or_else(|| read_first_line(&git_dir.join("HEAD")));
        return Some((root, common_dir));
    }
    None
}

fn read_origin_url(config: &Path) -> Option<String> {
    let file = File::open(config).ok()?;
    let mut in_origin = false;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            let section = line[1..line.len() - 1].trim();
            in_origin = section.split_once(' ').is_some_and(|(name, remote)| {
                name.eq_ignore_ascii_case("remote")
                    && remote
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'')
                        .eq_ignore_ascii_case("origin")
            }) || section.eq_ignore_ascii_case("remote.origin");
            continue;
        }
        if !in_origin {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("url") {
            let value = value.trim();
            let value = value
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix('"'))
                .unwrap_or(value)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn normalize_remote(remote: &str) -> Option<(String, String)> {
    let remote = remote.trim().trim_end_matches('/');
    if remote.is_empty() {
        return None;
    }

    let host_path = if let Some((scheme, remainder)) = remote.split_once("://") {
        if scheme.eq_ignore_ascii_case("file") {
            let local = normalize_path(Path::new(remainder));
            return Some((format!("local:{local}"), path_name(&local)));
        }
        let (_, remainder) = remainder.rsplit_once('@').unwrap_or(("", remainder));
        let (host, path) = remainder.split_once('/').unwrap_or((remainder, ""));
        format!("{}/{}", host.to_lowercase(), path.trim_matches('/'))
    } else if !remote.contains('/')
        || remote
            .find(':')
            .is_some_and(|colon| remote[..colon].contains('@') && !remote[..colon].contains('\\'))
    {
        let (host, path) = remote.split_once(':')?;
        let host = host.rsplit_once('@').map_or(host, |(_, host)| host);
        format!("{}/{}", host.to_lowercase(), path.trim_matches('/'))
    } else {
        let local = remote.strip_prefix("file://").unwrap_or(remote);
        format!("local:{}", normalize_path(Path::new(local)))
    };
    let host_path = host_path.trim_end_matches('/');
    let host_path = strip_git_suffix(host_path);
    let name = host_path
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())?
        .to_owned();
    Some((host_path.to_owned(), name))
}

fn strip_git_suffix(value: &str) -> &str {
    value
        .get(..value.len().saturating_sub(4))
        .filter(|_| value.to_ascii_lowercase().ends_with(".git"))
        .unwrap_or(value)
}

fn read_first_line(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut line = String::new();
    BufReader::new(file).read_line(&mut line).ok()?;
    Some(line.trim().to_owned())
}

fn absolute_from(base: &Path, path: &str) -> PathBuf {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        path
    } else {
        base.join(path)
    }
}

fn absolute_path(path: &str) -> PathBuf {
    let path = PathBuf::from(path);
    let path = if path.is_absolute() {
        path
    } else if path.as_os_str().is_empty() {
        path
    } else {
        std::env::current_dir()
            .map(|directory| directory.join(&path))
            .unwrap_or(path)
    };
    std::fs::canonicalize(&path).unwrap_or_else(|_| lexical_normalize(&path))
}

fn lexical_normalize(path: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !output.pop() {
                    output.push(component.as_os_str());
                }
            }
            other => output.push(other.as_os_str()),
        }
    }
    output
}

fn normalize_path(path: &Path) -> String {
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| lexical_normalize(path));
    let separator = if cfg!(windows) { '\\' } else { '/' };
    let mut value = canonical
        .to_string_lossy()
        .replace(['/', '\\'], &separator.to_string());
    if !cfg!(windows) {
        while value.len() > 1 && value.ends_with('/') {
            value.pop();
        }
        return value;
    }
    if let Some(rest) = value.strip_prefix("\\\\?\\UNC\\") {
        value = format!("\\\\{rest}");
    } else if let Some(rest) = value.strip_prefix("\\\\?\\") {
        value = rest.to_owned();
    }
    while value.len() > 1 && value.ends_with('\\') && !is_drive_root(&value) {
        value.pop();
    }
    if cfg!(windows) {
        value.make_ascii_lowercase();
    }
    value
}

fn is_drive_root(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 3 && bytes[1] == b':' && bytes[2] == b'\\'
}

fn path_name(path: &str) -> String {
    path.trim_end_matches(['\\', '/'])
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or_default()
        .to_owned()
}
