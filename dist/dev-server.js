"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDevRequest = exports.rawBody = void 0;
const entrypoint = process.env.VERCEL_DEV_ENTRYPOINT;
delete process.env.VERCEL_DEV_ENTRYPOINT;
const tsconfig = process.env.VERCEL_DEV_TSCONFIG;
delete process.env.VERCEL_DEV_TSCONFIG;
if (!entrypoint) {
    throw new Error("`VERCEL_DEV_ENTRYPOINT` must be defined");
}
const path_1 = require("path");
const ts_node_1 = require("ts-node");
const resolveTypescript = (p) => {
    try {
        return require.resolve("typescript", {
            paths: [p],
        });
    }
    catch (_) {
        return "";
    }
};
const requireTypescript = (p) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(p);
};
let ts = null;
// Assume Node 10 as the lowest common denominator
let target = "ES2018";
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 14) {
    target = "ES2020";
}
else if (nodeMajor >= 12) {
    target = "ES2019";
}
// Use the project's version of Typescript if available and supports `target`
let compiler = resolveTypescript(process.cwd());
if (compiler) {
    ts = requireTypescript(compiler);
    if (!(target in ts.ScriptTarget)) {
        ts = null;
    }
}
// Otherwise fall back to using the copy that `@vercel/node` uses
if (!ts) {
    compiler = resolveTypescript(path_1.join(__dirname, ".."));
    ts = requireTypescript(compiler);
}
if (tsconfig) {
    try {
        const { config } = ts.readConfigFile(tsconfig, ts.sys.readFile);
        if ((_a = config === null || config === void 0 ? void 0 : config.compilerOptions) === null || _a === void 0 ? void 0 : _a.target) {
            target = config.compilerOptions.target;
        }
    }
    catch (err) {
        if (err.code !== "ENOENT") {
            console.error(`Error while parsing "${tsconfig}"`);
            throw err;
        }
    }
}
ts_node_1.register({
    compiler,
    compilerOptions: {
        allowJs: true,
        esModuleInterop: true,
        jsx: "react",
        module: "commonjs",
        target,
    },
    project: tsconfig || undefined,
    transpileOnly: true,
});
const http_1 = require("http");
const launcher_1 = require("./launcher");
function listen(server, port, host) {
    return new Promise((resolve) => {
        server.listen(port, host, () => {
            resolve();
        });
    });
}
let bridge = undefined;
async function main() {
    const config = JSON.parse(process.env.VERCEL_DEV_CONFIG || "{}");
    delete process.env.VERCEL_DEV_CONFIG;
    const buildEnv = JSON.parse(process.env.VERCEL_DEV_BUILD_ENV || "{}");
    delete process.env.VERCEL_DEV_BUILD_ENV;
    const shouldAddHelpers = !(config.helpers === false || buildEnv.NODEJS_HELPERS === "0");
    bridge = launcher_1.getNowLauncher({
        entrypointPath: path_1.join(process.cwd(), entrypoint),
        helpersPath: "./helpers",
        shouldAddHelpers,
        bridgePath: "not used",
        sourcemapSupportPath: "not used",
    })();
    const proxyServer = http_1.createServer(onDevRequest);
    await listen(proxyServer, 0, "127.0.0.1");
    const address = proxyServer.address();
    if (typeof process.send === "function") {
        process.send(address);
    }
    else {
        console.log("Dev server listening:", address);
    }
}
function rawBody(readable) {
    return new Promise((resolve, reject) => {
        let bytes = 0;
        const chunks = [];
        readable.on("error", reject);
        readable.on("data", (chunk) => {
            chunks.push(chunk);
            bytes += chunk.length;
        });
        readable.on("end", () => {
            resolve(Buffer.concat(chunks, bytes));
        });
    });
}
exports.rawBody = rawBody;
async function onDevRequest(req, res) {
    const body = await rawBody(req);
    const event = {
        Action: "Invoke",
        body: JSON.stringify({
            method: req.method,
            path: req.url,
            headers: req.headers,
            encoding: "base64",
            body: body.toString("base64"),
        }),
    };
    if (!bridge) {
        res.statusCode = 500;
        res.end("Bridge is not defined");
        return;
    }
    const result = await bridge.launcher(event, {
        callbackWaitsForEmptyEventLoop: false,
    });
    res.statusCode = result.statusCode;
    for (const [key, value] of Object.entries(result.headers)) {
        if (typeof value !== "undefined") {
            res.setHeader(key, value);
        }
    }
    res.end(Buffer.from(result.body, result.encoding));
}
exports.onDevRequest = onDevRequest;
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
