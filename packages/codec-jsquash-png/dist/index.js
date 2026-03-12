Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs"),
	path = require("path");
var i = ((e) =>
	typeof require < "u"
		? require
		: typeof Proxy < "u"
			? new Proxy(e, { get: (t, a) => (typeof require < "u" ? require : t)[a] })
			: e)(function (e) {
	if (typeof require < "u") return require.apply(this, arguments);
	throw Error('Dynamic require of "' + e + '" is not supported');
});
var n = null;
function c() {
	return (
		n ||
		((n = (async () => {
			const e = path.dirname(i.resolve("@jsquash/png")),
				t = path.join(e, "codec", "pkg", "squoosh_png_bg.wasm"),
				a = fs.readFileSync(t),
				o = await import("@jsquash/png/decode.js"),
				r = await import("@jsquash/png/encode.js");
			return (
				await Promise.all([o.init(a), r.init(a)]),
				{ decode: o.default, encode: r.default }
			);
		})()),
		n)
	);
}
async function h(e) {
	try {
		const { decode: t } = await c(),
			a = typeof e == "string" ? fs.readFileSync(e) : e,
			o = new Uint8Array(a).buffer,
			r = await t(o);
		return { data: r.data, width: r.width, height: r.height };
	} catch (t) {
		throw new Error(`Failed to read PNG file ${e}: ${t}`);
	}
}
async function m(e, t) {
	try {
		const { encode: a } = await c(),
			o = {
				data: new Uint8ClampedArray(
					e.data.buffer,
					e.data.byteOffset,
					e.data.byteLength,
				),
				width: e.width,
				height: e.height,
				colorSpace: "srgb",
			},
			r = await a(o);
		fs.writeFileSync(t, Buffer.from(r));
	} catch (a) {
		throw new Error(`Failed to write PNG file ${t}: ${a}`);
	}
}
var l = { read: h, write: m },
	p = l;
exports.codecJsquashPng = l;
exports.default = p;
