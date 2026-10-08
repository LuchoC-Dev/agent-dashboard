import { createHashRouter } from "react-router";
import { createQueryClient } from "./queries";
import { createRoutes } from "./routes";

// Created once, outside React, as the data router docs require. Hash history keeps
// deep links working under the Tauri protocol and carries the mock `?estado=` fixtures.
export const queryClient = createQueryClient();
export const router = createHashRouter(createRoutes(queryClient));
