import { useOutletContext } from "react-router";
import type { Palette } from "../../lib/colors";
import type { ShellData } from "./useShellData";

/** What the shell layout route hands to every screen. */
export type ShellContext = {
  data: ShellData;
  colors: Palette;
  refresh: () => void;
};
export const useShell = () => useOutletContext<ShellContext>();
