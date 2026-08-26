import { vi, type Mock } from "vitest";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

// pg's real QueryResult needs command/oid/fields too, not just rows/rowCount
// fill in defaults so test literals are valid without an `as any` cast
export function mockQueryResult<R extends QueryResultRow = QueryResultRow>(
  overrides: Partial<QueryResult<R>> = {},
): QueryResult<R> {
  return {
    command: "",
    oid: 0,
    fields: [],
    rows: [] as R[],
    rowCount: overrides.rows?.length ?? 0,
    ...overrides,
  };
}

// pool is a static import from the real db/pool.js module, so pool.query
// and pool.connect stay typed against pg's overloaded Pool methods, which
// makes mockImplementation painful to type
// this builds a plain vi.fn() object and asserts it as Pool once here
// so test files don't each need their own `as any`
export function createMockPool(): Pool {
  return {
    query: vi.fn(),
    connect: vi.fn(),
  } as unknown as Pool;
}

export function createMockPoolClient(): PoolClient {
  return {
    query: vi.fn(),
    release: vi.fn(),
  } as unknown as PoolClient;
}

type SimpleQueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;
type SimpleConnectFn = () => Promise<PoolClient>;

// retypes an already mocked query function against one plain signature
// instead of pg's overloads, so mockImplementation gets clean inferred
// sql/params types with no any
export function mockedQuery(fn: unknown): Mock<SimpleQueryFn> {
  return fn as Mock<SimpleQueryFn>;
}

export function mockedConnect(fn: unknown): Mock<SimpleConnectFn> {
  return fn as Mock<SimpleConnectFn>;
}
