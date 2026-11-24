#!/usr/bin/env node
// egregore-omp: run an Egregore instance's Pi runtime inside omp (oh-my-pi).
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = "egregore-omp adapter";
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "template", "egregore.ts");
const EXTENSION = ".omp/extensions/egregore.ts";
const APPEND = ".omp/APPEND_SYSTEM.md";
const APPEND_TARGET = "../.pi/APPEND_SYSTEM.md";
// omp's extension discovery honors git ignores for files inside .omp/extensions,
// so the extension is excluded by its directory: a file pattern would hide it.
const EXCLUDES = ["/.omp/extensions/", `/${APPEND}`];

const USAGE = `usage: egregore-omp [install|uninstall|status] [--force] [instance-path...]

Without a path: the Egregore instance containing the current directory,
otherwise every instance in ~/.egregore/instances.json.`;

function fail(message) {
	console.error(`egregore-omp: ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const args = { command: "install", force: false, paths: [] };
	for (const arg of argv) {
		if (arg === "-h" || arg === "--help") {
			console.log(USAGE);
			process.exit(0);
		} else if (arg === "--force") args.force = true;
		else if (["install", "uninstall", "status"].includes(arg)) args.command = arg;
		else if (arg.startsWith("-")) fail(`unknown option ${arg}\n${USAGE}`);
		else args.paths.push(resolve(arg));
	}
	return args;
}

const isInstance = (dir) => existsSync(join(dir, "egregore.json"));

function findInstanceUp(start) {
	for (let dir = start; ; dir = dirname(dir)) {
		if (isInstance(dir)) return dir;
		if (dirname(dir) === dir) return null;
	}
}

function registeredInstances() {
	const file = join(homedir(), ".egregore", "instances.json");
	if (!existsSync(file)) return [];
	try {
		return JSON.parse(readFileSync(file, "utf8")).map((entry) => entry.path).filter(Boolean);
	} catch (error) {
		fail(`cannot read ${file}: ${error.message}`);
	}
}

function targets(paths) {
	if (paths.length) {
		for (const dir of paths) if (!isInstance(dir)) fail(`${dir} is not an Egregore instance (no egregore.json)`);
		return paths;
	}
	const here = findInstanceUp(process.cwd());
	if (here) return [here];
	const all = registeredInstances().filter(isInstance);
	if (!all.length) fail("no Egregore instance here or in ~/.egregore/instances.json — run `npx create-egregore@latest` first");
	return all;
}

function lstatOrNull(file) {
	try {
		return lstatSync(file);
	} catch {
		return null;
	}
}

const ownsExtension = (file) => existsSync(file) && readFileSync(file, "utf8").includes(MARKER);
const ownsAppend = (file) => lstatOrNull(file)?.isSymbolicLink() && readlinkSync(file) === APPEND_TARGET;

// .git is a directory in a clone and a "gitdir:" file in a worktree.
function excludeFile(dir) {
	const gitPath = join(dir, ".git");
	const stat = lstatOrNull(gitPath);
	if (stat?.isDirectory()) return join(gitPath, "info", "exclude");
	if (stat?.isFile()) {
		const match = readFileSync(gitPath, "utf8").match(/^gitdir:\s*(.+)$/m);
		if (match) {
			const gitDir = match[1].trim();
			return join(isAbsolute(gitDir) ? gitDir : resolve(dir, gitDir), "info", "exclude");
		}
	}
	return null;
}

function updateExcludes(dir, add) {
	const file = excludeFile(dir);
	if (!file) return;
	const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
	const kept = lines.filter((line) => !EXCLUDES.includes(line));
	if (add) {
		while (kept.length && kept.at(-1) === "") kept.pop();
		kept.push(...EXCLUDES, "");
	}
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, kept.join("\n"));
}

function removeIfEmpty(dir) {
	try {
		rmdirSync(dir);
	} catch {}
}

function install(dir, force) {
	const pi = join(dir, ".pi", "extensions", "egregore.ts");
	if (!existsSync(pi) || !existsSync(join(dir, ".pi", "APPEND_SYSTEM.md"))) {
		console.error(`✗ ${dir}: no Pi runtime. Add it with:\n    npx create-egregore@latest --add-harness pi --instance ${dir}`);
		return false;
	}
	let ok = true;

	const extension = join(dir, EXTENSION);
	if (existsSync(extension) && !ownsExtension(extension) && !force) {
		console.error(`✗ ${dir}: ${EXTENSION} exists and is not ours (use --force to replace it)`);
		ok = false;
	} else {
		mkdirSync(dirname(extension), { recursive: true });
		writeFileSync(extension, readFileSync(TEMPLATE, "utf8"));
	}

	const append = join(dir, APPEND);
	if (!ownsAppend(append)) {
		if (lstatOrNull(append) && !force) {
			console.error(`✗ ${dir}: ${APPEND} exists and is not ours (use --force to replace it)`);
			ok = false;
		} else {
			if (lstatOrNull(append)) unlinkSync(append);
			symlinkSync(APPEND_TARGET, append);
		}
	}

	updateExcludes(dir, true);
	if (ok) console.log(`✓ ${dir}: ready — run \`omp\` there`);
	return ok;
}

function uninstall(dir) {
	const extension = join(dir, EXTENSION);
	const append = join(dir, APPEND);
	if (ownsExtension(extension)) unlinkSync(extension);
	if (ownsAppend(append)) unlinkSync(append);
	removeIfEmpty(join(dir, ".omp", "extensions"));
	removeIfEmpty(join(dir, ".omp"));
	updateExcludes(dir, false);
	console.log(`✓ ${dir}: removed`);
	return true;
}

function status(dir) {
	const extension = ownsExtension(join(dir, EXTENSION));
	const append = ownsAppend(join(dir, APPEND));
	const state = extension && append ? "installed" : extension || append ? "partial" : "not installed";
	console.log(`${dir}: ${state}`);
	return true;
}

const args = parseArgs(process.argv.slice(2));
const run = { install: (dir) => install(dir, args.force), uninstall, status }[args.command];
let ok = true;
for (const dir of targets(args.paths)) ok = run(dir) && ok;
process.exit(ok ? 0 : 1);
