const assert = require("assert");
const fs = require("fs");
const { generateLabels, indexOfAll, findLineMatches, assignMatchLabels } = require("./extension");

assert.deepStrictEqual(generateLabels(0, "ab"), []);
assert.deepStrictEqual(generateLabels(3, "abc"), ["a", "b", "c"]);
assert.deepStrictEqual(generateLabels(4, "ab"), ["aa", "ab", "ba", "bb"]);
assert.deepStrictEqual(generateLabels(3, "aabc"), ["a", "b", "c"]);

assert.deepStrictEqual(indexOfAll("banana", "ana", true), [1]);
assert.deepStrictEqual(indexOfAll("Foo foo", "foo", false), [0, 4]);
assert.deepStrictEqual(indexOfAll("Foo foo", "foo", true), [4]);

assert.deepStrictEqual(findLineMatches(["foo", "barfoo"], "foo", { maxMatches: 10 }), [
  { line: 0, character: 0, length: 3 },
  { line: 1, character: 3, length: 3 },
]);
assert.deepStrictEqual(findLineMatches(["aaaa"], "aa", { maxMatches: 10 }), [
  { line: 0, character: 0, length: 2 },
  { line: 0, character: 2, length: 2 },
]);
assert.deepStrictEqual(findLineMatches(["foo", "foo"], "foo", { maxMatches: 1 }), [
  { line: 0, character: 0, length: 3 },
]);

const segmentMatches = [
  { text: "segment", start: 0, length: 2 },
  { text: "second", start: 0, length: 2 },
];
assert.deepStrictEqual(
  assignMatchLabels(segmentMatches, "se", "gcdab").map(match => match.label),
  ["d", "a"],
);

const extensionSource = fs.readFileSync("extension.js", "utf8");
assert.ok(!extensionSource.includes('registerCommand("type"'));
assert.ok(!extensionSource.includes("extension.vim_insert"));
assert.ok(extensionSource.includes("activeDecoration"));
assert.ok(!extensionSource.includes('backgroundColor: new vscode.ThemeColor("editor.findRangeHighlightBackground")'));
assert.ok(extensionSource.includes("extension.vim_backspace"));

const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const inputBindings = manifest.contributes.keybindings.filter(binding => binding.command === "flashFind.input");
assert.ok(inputBindings.some(binding => binding.key === "shift+-" && binding.args.text === "_"));
assert.ok(inputBindings.some(binding => binding.key === "-" && binding.args.text === "-"));
assert.ok(inputBindings.every(binding => binding.when.includes("flashFind.active")));

console.log("ok");
