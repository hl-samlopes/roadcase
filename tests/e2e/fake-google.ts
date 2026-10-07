import { createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { FAKE_GOOGLE_CLIENT, FAKE_GOOGLE_URL } from "./fixtures.ts";

interface Grant {
  claims: Record<string, unknown>;
  redirectUri: string;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A stand-in for Google's OpenID Connect endpoints, so end-to-end tests run a
 * real Google sign-in without Google. Its "choose an account" page asks for
 * the claims to send (email, account id, Workspace domain, verified), and the
 * id token it returns is signed like Google's (RS256, published key set).
 */
export async function startFakeGoogle() {
  const issuer = FAKE_GOOGLE_URL;
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "e2e-key";
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" };
  const grants = new Map<string, Grant>();

  const json = (response: ServerResponse, body: unknown, status = 200) => {
    response.statusCode = status;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  };

  const idToken = (claims: Record<string, unknown>) => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode({
      iss: issuer,
      aud: FAKE_GOOGLE_CLIENT.id,
      iat: now,
      exp: now + 600,
      ...claims,
    })}`;
    const signature = createSign("RSA-SHA256").update(body).sign(privateKey, "base64url");
    return `${body}.${signature}`;
  };

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuer);

    if (url.pathname === "/.well-known/openid-configuration") {
      return json(response, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        // Listed like Google's; Auth.js reads the id token instead of calling it.
        userinfo_endpoint: `${issuer}/userinfo`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    if (url.pathname === "/jwks") return json(response, { keys: [jwk] });

    if (url.pathname === "/authorize") {
      const hidden = ["redirect_uri", "state", "nonce"]
        .map((name) => {
          const value = url.searchParams.get(name);
          return value === null
            ? ""
            : `<input type="hidden" name="${name}" value="${escape(value)}">`;
        })
        .join("");
      response.setHeader("content-type", "text/html");
      response.end(`<!doctype html><title>Fake Google</title>
<form action="/approve" method="get">${hidden}
<label>Email <input name="email" required></label>
<label>Account ID <input name="sub" required></label>
<label>Workspace domain <input name="hd"></label>
<label><input type="checkbox" name="email_verified" checked> Email verified</label>
<button>Continue</button></form>`);
      return;
    }

    if (url.pathname === "/approve") {
      const param = (name: string) => url.searchParams.get(name);
      const code = randomBytes(16).toString("hex");
      grants.set(code, {
        redirectUri: param("redirect_uri") ?? "",
        claims: {
          sub: param("sub"),
          email: param("email"),
          email_verified: param("email_verified") === "on",
          ...(param("hd") ? { hd: param("hd") } : {}),
          ...(param("nonce") ? { nonce: param("nonce") } : {}),
        },
      });
      const back = new URL(param("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      if (param("state")) back.searchParams.set("state", param("state")!);
      response.statusCode = 302;
      response.setHeader("location", back.toString());
      response.end();
      return;
    }

    if (url.pathname === "/token" && request.method === "POST") {
      let raw = "";
      request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      request.on("end", () => {
        const form = new URLSearchParams(raw);
        const grant = grants.get(form.get("code") ?? "");
        grants.delete(form.get("code") ?? "");
        if (!grant || grant.redirectUri !== form.get("redirect_uri")) {
          return json(response, { error: "invalid_grant" }, 400);
        }
        json(response, {
          access_token: randomBytes(16).toString("hex"),
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile",
          id_token: idToken(grant.claims),
        });
      });
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  const { port } = new URL(issuer);
  await new Promise<void>((resolve) => server.listen(Number(port), resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
