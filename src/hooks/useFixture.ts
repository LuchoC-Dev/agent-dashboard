import { useSearchParams } from "react-router";
import { useMock } from "../api";

/**
 * Mock-only state fixture (`?estado=vacio|cargando|error`). It is part of every query key so
 * fixtures never share cache entries with sample data; the native app always gets `null`.
 */
export type Fixture = string | null;

export const fixtureOf = (params: URLSearchParams): Fixture =>
  useMock ? params.get("estado") : null;

/** The fixture the mock API will actually serve: it reads `location.hash` at call time. */
export const activeFixture = (): Fixture =>
  fixtureOf(new URLSearchParams(location.hash.split("?")[1]));

export function useFixture() {
  const [params] = useSearchParams();
  return fixtureOf(params);
}
