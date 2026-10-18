#!/usr/bin/env node
// Builds the font library (spec §20.1) from scripts/fonts/families.json: for every family it reads the
// Fontsource metadata of the Google Fonts release, keeps it only under a license that allows
// redistribution (SIL OFL 1.1, Apache 2.0, Ubuntu Font Licence), downloads its woff2 files for the
// latin and latin-ext subsets (the `wght` variable font when the family has one, else every static
// weight, italics included) and its license text, and writes public/fonts/library/:
//   <slug>/<slug>-<subset>-wght-<style>.woff2     variable families
//   <slug>/<slug>-<subset>-<weight>-<style>.woff2 static families
//   LICENSES/<slug>.txt
//   catalog.json                                   what src/text/fonts/catalog.ts reads
// The designers come from the Google Fonts metadata (else the license's copyright line).
//
// Versions are pinned: a family already in catalog.json is fetched again at its recorded Fontsource
// version (files already there with the right size are kept), so a rerun reproduces the folder.
// `--update` takes the latest versions. A family that fails is dropped and listed at the end. Folders of
// families no longer in the list are removed. Node 22, no dependencies:
//   node scripts/fonts/fetch-library.mjs [--update] [--force] [--only=<slug,slug>]
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FAMILIES = join(ROOT, "scripts", "fonts", "families.json");
const LIBRARY = join(ROOT, "public", "fonts", "library");
const CATALOG = join(LIBRARY, "catalog.json");
const LICENSES = join(LIBRARY, "LICENSES");

const API = "https://api.fontsource.org/v1";
const CDN = "https://cdn.jsdelivr.net";
const GOOGLE_METADATA = "https://fonts.google.com/metadata/fonts";
const SUBSETS = ["latin", "latin-ext"];
const LICENSE_NAMES = { "OFL-1.1": "SIL Open Font License 1.1", "Apache-2.0": "Apache License 2.0", "UFL-1.0": "Ubuntu Font Licence 1.0" };
const MAX_BYTES = 40 * 1024 * 1024;
const CONCURRENCY = 8;

const args = process.argv.slice(2);
const update = args.includes("--update");
const force = args.includes("--force");
const only = new Set((args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length) ?? "").split(",").filter(Boolean));

/** The folder and id of a family: Fontsource's id (lower case, runs of other characters as one dash). */
const slugOf = (family) =>
  family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function fetchWithRetry(url, as) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return as === "json" ? await response.json() : as === "text" ? await response.text() : new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new Error(`${url}: ${last instanceof Error ? last.message : String(last)}`);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

/** Runs `task` over `items` with at most `limit` at a time; results in input order. */
async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The designers of each family (Google Fonts metadata), or an empty map when it cannot be read. */
async function googleDesigners() {
  try {
    const text = await fetchWithRetry(GOOGLE_METADATA, "text");
    const data = JSON.parse(text.slice(text.indexOf("{")));
    return new Map(data.familyMetadataList.map((entry) => [entry.family, entry.designers ?? []]));
  } catch (error) {
    console.warn(`Google Fonts metadata unavailable (${error.message}): designers come from the license texts.`);
    return new Map();
  }
}

/** "Copyright 2020 The Anton Project Authors (https://...)" -> "The Anton Project Authors". */
function holderOf(license) {
  const line = license.split("\n").find((row) => /copyright/i.test(row)) ?? "";
  return line
    .replace(/^.*?copyright\s*(\(c\)|©)?\s*/i, "")
    .replace(/^[\d\s,\-–]+/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/[,.]?\s*(with reserved font name.*|all rights reserved.*)$/i, "")
    .trim();
}

/** The files to download for one family: [{ subset, style, weight | range, url, file }]. */
async function planFiles(meta, slug, version) {
  const subsets = SUBSETS.filter((subset) => meta.subsets.includes(subset));
  const styles = ["normal", "italic"].filter((style) => meta.styles.includes(style));
  let range = null;
  if (meta.variable) {
    const variable = await fetchWithRetry(`${API}/variable/${slug}`, "json");
    const wght = variable?.axes?.wght;
    if (wght) range = [Number(wght.min), Number(wght.max)];
  }
  const files = [];
  for (const style of styles) {
    for (const subset of subsets) {
      if (range) {
        files.push({ subset, style, range, url: `${CDN}/fontsource/fonts/${slug}:vf@${version}/${subset}-wght-${style}.woff2`, file: `${slug}-${subset}-wght-${style}.woff2` });
      } else {
        // Only the weights that exist in this style (some families have fewer italic weights).
        for (const weight of meta.weights) {
          if (!meta.variants?.[weight]?.[style]?.[subset]) continue;
          files.push({ subset, style, weight, url: `${CDN}/fontsource/fonts/${slug}@${version}/${subset}-${weight}-${style}.woff2`, file: `${slug}-${subset}-${weight}-${style}.woff2` });
        }
      }
    }
  }
  return { files, range, subsets, styles };
}

async function buildFamily(curated, pinned, designers) {
  const slug = slugOf(curated.family);
  const meta = await fetchWithRetry(`${API}/fonts/${slug}`, "json");
  if (!meta) throw new Error("not on Fontsource");
  if (meta.family !== curated.family) throw new Error(`Fontsource names it "${meta.family}"`);
  if (!LICENSE_NAMES[meta.license]) throw new Error(`license ${meta.license} is not redistributable here`);
  if (!meta.subsets.includes("latin")) throw new Error("no latin subset");
  const version = (!update && pinned?.version) || meta.npmVersion;
  const license = await fetchWithRetry(`${CDN}/npm/@fontsource/${slug}@${version}/LICENSE`, "text");
  if (!license) throw new Error("no license text");
  const plan = await planFiles(meta, slug, version);
  const folder = join(LIBRARY, slug);
  await mkdir(folder, { recursive: true });
  const known = new Map((pinned?.version === version ? pinned.files : []).map((file) => [file.path, file.bytes]));
  const files = [];
  for (const item of plan.files) {
    const path = `${slug}/${item.file}`;
    const target = join(folder, item.file);
    let bytes = force ? -1 : await sizeOf(target);
    if (bytes < 0 || known.get(path) !== bytes) {
      const data = await fetchWithRetry(item.url, "bytes");
      // A file the CDN does not have (a variable style, or a static italic weight the metadata lists
      // but the release lacks) is left out, and so is its face in the other subset (below).
      if (!data) continue;
      await writeFile(target, data);
      bytes = data.byteLength;
    }
    files.push({ subset: item.subset, ...(item.range ? { range: item.range } : { weight: item.weight }), style: item.style, path, bytes });
  }
  // A face (weight or range, style) is kept only with its latin file.
  const faceKey = (file) => `${file.weight ?? file.range}|${file.style}`;
  const withLatin = new Set(files.filter((file) => file.subset === "latin").map(faceKey));
  for (let i = files.length - 1; i >= 0; i -= 1) {
    if (withLatin.has(faceKey(files[i]))) continue;
    await rm(join(folder, files[i].path.slice(slug.length + 1)), { force: true });
    files.splice(i, 1);
  }
  if (!files.some((file) => file.subset === "latin" && file.style === "normal")) throw new Error("no upright latin file");
  // Files of an earlier version or plan that are no longer listed.
  const keep = new Set(files.map((file) => file.path.slice(slug.length + 1)));
  for (const name of await readdir(folder)) if (!keep.has(name)) await rm(join(folder, name));
  await writeFile(join(LICENSES, `${slug}.txt`), license.replace(/\r\n/g, "\n"));
  const designer = (designers.get(curated.family) ?? []).join(", ") || holderOf(license) || "Unknown";
  const weights = plan.range ? meta.weights.filter((weight) => weight >= plan.range[0] && weight <= plan.range[1]) : [...new Set(files.map((file) => file.weight))].sort((a, b) => a - b);
  return {
    id: slug,
    family: curated.family,
    slug,
    categories: curated.categories,
    tags: curated.tags ?? [],
    weights,
    italic: files.some((file) => file.style === "italic"),
    variable: plan.range ? { wght: plan.range } : null,
    files,
    license: meta.license,
    designer,
    version,
    ranges: Object.fromEntries(plan.subsets.map((subset) => [subset, meta.unicodeRange?.[subset] ?? ""])),
  };
}

function formatCatalog(catalog) {
  const { families, ...head } = catalog;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  return `${top},\n  "families": [\n${families.map((family) => `    ${JSON.stringify(family)}`).join(",\n")}\n  ]\n}\n`;
}

async function main() {
  const curated = JSON.parse(await readFile(FAMILIES, "utf8"));
  const categoryIds = new Set(curated.categories.map((category) => category.id));
  for (const family of curated.families) {
    const unknown = family.categories.filter((id) => !categoryIds.has(id));
    if (unknown.length > 0 || family.categories.length === 0) throw new Error(`${family.family}: categories ${JSON.stringify(family.categories)}`);
  }
  const previous = await readJson(CATALOG);
  const pinned = new Map((previous?.families ?? []).map((family) => [family.slug, family]));
  await mkdir(LICENSES, { recursive: true });
  const designers = await googleDesigners();
  const wanted = curated.families.filter((family) => only.size === 0 || only.has(slugOf(family.family)));
  const dropped = [];
  let done = 0;
  const built = await pool(wanted, CONCURRENCY, async (family) => {
    try {
      const entry = await buildFamily(family, pinned.get(slugOf(family.family)), designers);
      done += 1;
      if (done % 25 === 0) console.log(`${done} / ${wanted.length}`);
      return entry;
    } catch (error) {
      dropped.push(`${family.family}: ${error.message}`);
      return null;
    }
  });
  // With --only the other families keep their catalog entries.
  const rebuilt = new Map(built.filter(Boolean).map((entry) => [entry.slug, entry]));
  const families = curated.families
    .map((family) => {
      const slug = slugOf(family.family);
      return rebuilt.get(slug) ?? (only.size > 0 && !only.has(slug) ? pinned.get(slug) : undefined);
    })
    .filter(Boolean)
    .sort((a, b) => a.family.localeCompare(b.family));
  // The unicode range of each subset, kept once (the most common one); a family whose range differs
  // keeps its own in `ranges`.
  const ranges = {};
  for (const subset of SUBSETS) {
    const counts = new Map();
    for (const family of families) {
      const range = family.ranges?.[subset];
      if (range) counts.set(range, (counts.get(range) ?? 0) + 1);
    }
    const common = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (common) ranges[subset] = common[0];
  }
  for (const family of families) {
    const own = Object.fromEntries(Object.entries(family.ranges ?? {}).filter(([subset, range]) => range && range !== ranges[subset]));
    if (Object.keys(own).length > 0) family.ranges = own;
    else delete family.ranges;
  }
  // Folders and licenses of families that left the list.
  const slugs = new Set(families.map((family) => family.slug));
  for (const entry of await readdir(LIBRARY, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "LICENSES" && !slugs.has(entry.name)) await rm(join(LIBRARY, entry.name), { recursive: true });
  }
  for (const name of await readdir(LICENSES)) if (!slugs.has(name.replace(/\.txt$/, ""))) await rm(join(LICENSES, name));
  const catalog = { version: 1, source: "Google Fonts, through Fontsource (fontsource.org)", categories: curated.categories, subsets: ranges, licenses: LICENSE_NAMES, families };
  await writeFile(CATALOG, formatCatalog(catalog));

  // Report: the totals and the §20.1 rules.
  let fontBytes = 0;
  for (const family of families) for (const file of family.files) fontBytes += file.bytes;
  let licenseBytes = 0;
  for (const name of await readdir(LICENSES)) licenseBytes += await sizeOf(join(LICENSES, name));
  const catalogBytes = await sizeOf(CATALOG);
  const total = fontBytes + licenseBytes + catalogBytes;
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  console.log(`\n${families.length} families, ${families.reduce((n, family) => n + family.files.length, 0)} font files`);
  console.log(`fonts ${mb(fontBytes)} + licenses ${mb(licenseBytes)} + catalog ${mb(catalogBytes)} = ${mb(total)} (cap ${mb(MAX_BYTES)})`);
  const perCategory = curated.categories.map((category) => `${category.id} ${families.filter((family) => family.categories.includes(category.id)).length}`);
  console.log(`categories: ${perCategory.join(", ")}`);
  console.log(`licenses: ${Object.keys(LICENSE_NAMES).map((id) => `${id} ${families.filter((family) => family.license === id).length}`).join(", ")}`);
  console.log(`variable: ${families.filter((family) => family.variable).length}, static: ${families.filter((family) => !family.variable).length}`);
  if (dropped.length > 0) console.log(`\ndropped ${dropped.length}:\n  ${dropped.join("\n  ")}`);
  const problems = [];
  if (families.length < 200) problems.push(`only ${families.length} families (at least 200)`);
  if (total > MAX_BYTES) problems.push(`${mb(total)} is over the cap`);
  for (const category of curated.categories) {
    const count = families.filter((family) => family.categories.includes(category.id)).length;
    const min = ["luxury", "modern", "bold", "futuristic", "handwritten"].includes(category.id) ? 25 : 10;
    if (count < min) problems.push(`${category.id} has ${count} families (at least ${min})`);
  }
  if (problems.length > 0) {
    console.log(`\nrules not met:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
