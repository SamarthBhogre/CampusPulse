/**
 * Minimal chainable Supabase client double.
 *
 * Every query is recorded in `calls` as { table | rpc, params, ops, terminal };
 * `respond(call)` decides what { data, error } the query resolves to.
 */
const MUTATIONS = new Set(['insert', 'update', 'delete', 'upsert']);

export function createMockSupabase(respond = () => ({ data: null, error: null }), { user = null } = {}) {
  const calls = [];

  function query(target) {
    const call = { ...target, ops: [] };
    const run = (terminal) => {
      const recorded = { ...call, terminal };
      calls.push(recorded);
      return Promise.resolve(respond(recorded) ?? { data: null, error: null });
    };
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => run('then').then(resolve, reject);
        if (prop === 'single' || prop === 'maybeSingle') return () => run(prop);
        return (...args) => { call.ops.push([prop, ...args]); return proxy; };
      },
    });
    return proxy;
  }

  return {
    calls,
    from: (table) => query({ table }),
    rpc: (fn, params) => query({ rpc: fn, params }),
    auth: {
      getUser: async (token) => (user && token
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT' } }),
    },
    mutations: () => calls.filter((c) => c.ops.some(([op]) => MUTATIONS.has(op))),
  };
}

/** Value passed to the first `.op(...)` call with this name, e.g. opArg(call, 'insert'). */
export function opArg(call, name) {
  return call.ops.find(([op]) => op === name)?.slice(1);
}

/** Builds an unsigned JWT-shaped token with the given claims (signature is never checked locally). */
export function fakeJwt(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}
