use agent_dashboard_lib::projects::ProjectResolver;
use std::{fs, path::Path};

fn create_repo(path: &Path, remote: &str) {
    let git_dir = path.join(".git");
    fs::create_dir_all(&git_dir).unwrap();
    fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();
    fs::write(
        git_dir.join("config"),
        format!("[remote \"origin\"]\n\turl = {remote}\n"),
    )
    .unwrap();
}

#[test]
fn worktree_uses_the_main_repository_origin_and_name() {
    let temp = tempfile::tempdir().unwrap();
    let main = temp.path().join("dashboard");
    create_repo(&main, "git@github.com:acme/dashboard.git");

    let common_git = main.join(".git");
    let worktree = temp.path().join("dashboard-feature");
    fs::create_dir_all(&worktree).unwrap();
    let worktree_git = common_git.join("worktrees/feature");
    fs::create_dir_all(&worktree_git).unwrap();
    fs::write(worktree_git.join("commondir"), "../..\n").unwrap();
    fs::write(worktree_git.join("HEAD"), "ref: refs/heads/feature\n").unwrap();
    fs::write(
        worktree.join(".git"),
        format!("gitdir: {}\n", worktree_git.display()),
    )
    .unwrap();

    let mut resolver = ProjectResolver::default();
    let main_identity = resolver.resolve(main.to_str().unwrap());
    let worktree_identity = resolver.resolve(worktree.to_str().unwrap());
    assert_eq!(worktree_identity.key, "git:github.com/acme/dashboard");
    assert_eq!(worktree_identity.key, main_identity.key);
    assert_eq!(worktree_identity.name, "dashboard");
}

#[test]
fn clones_with_the_same_origin_share_an_identity() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("first-copy");
    let second = temp.path().join("second-copy");
    create_repo(&first, "https://github.com/acme/dashboard.git");
    create_repo(&second, "git@github.com:acme/dashboard");

    let mut resolver = ProjectResolver::default();
    let first_identity = resolver.resolve(first.to_str().unwrap());
    let second_identity = resolver.resolve(second.to_str().unwrap());
    assert_eq!(first_identity.key, "git:github.com/acme/dashboard");
    assert_eq!(first_identity.key, second_identity.key);
}

#[test]
fn repositories_with_the_same_name_but_different_origins_stay_separate() {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("one/dashboard");
    let second = temp.path().join("two/dashboard");
    create_repo(&first, "https://github.com/acme/dashboard.git");
    create_repo(&second, "https://github.com/other/dashboard.git");

    let mut resolver = ProjectResolver::default();
    let first_identity = resolver.resolve(first.to_str().unwrap());
    let second_identity = resolver.resolve(second.to_str().unwrap());
    assert_eq!(first_identity.name, second_identity.name);
    assert_ne!(first_identity.key, second_identity.key);
}

#[test]
fn non_git_directories_use_a_normalized_path_identity() {
    let temp = tempfile::tempdir().unwrap();
    let directory = temp.path().join("plain-project");
    fs::create_dir_all(&directory).unwrap();
    let equivalent = directory.join("nested/../..").join("plain-project");

    let mut resolver = ProjectResolver::default();
    let identity = resolver.resolve(directory.to_str().unwrap());
    let equivalent_identity = resolver.resolve(equivalent.to_str().unwrap());
    assert!(identity.key.starts_with("path:"));
    assert_eq!(identity.key, equivalent_identity.key);
    assert_eq!(identity.name, "plain-project");
}
