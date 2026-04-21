const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const BASE_URL = "https://global.ceskecukrovinky.sk";
const START_URL = "https://global.ceskecukrovinky.sk/2-vsechno";

function normalizeCategory(text) {
  const value = text.trim().toLowerCase();

  const map = {
    "želé": "zele",
    "zele": "zele",
    "pelendreky": "pelendreky",
    "pásky": "pasky",
    "pasky": "pasky",
    "lízanky": "lizanky",
    "lizanky": "lizanky",
    "cukríky": "cukriky",
    "cukriky": "cukriky",
    "čokoláda": "cokolada",
    "cokolada": "cokolada",
    "zdravá výživa": "zdrava_vyziva",
    "zdrava vyziva": "zdrava_vyziva",
    "mikuláš": "mikulas",
    "mikulas": "mikulas",
    "vianoce": "vanoce",
    "valentín": "valentyn",
    "valentin": "valentyn",
    "karnevaly": "karnevaly",
    "veľká noc": "velikonoce",
    "velka noc": "velikonoce",
    "kyslé": "kysle",
    "kysle": "kysle",
    "mix": "mix"
  };

  return map[value] || value.replace(/\s+/g, "_");
}

function extractPrice(text) {
  if (!text) return 0;
  const cleaned = text.replace(/\u00a0/g, " ").replace(/€/g, "").replace(",", ".").trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function fallbackCategoriesFromName(name) {
  const n = name.toLowerCase();
  const out = new Set();

  if (n.includes("želé") || n.includes("zele")) out.add("zele");
  if (n.includes("pelendrek")) out.add("pelendreky");
  if (n.includes("pásky") || n.includes("pasky")) out.add("pasky");
  if (n.includes("lízank") || n.includes("lizank")) out.add("lizanky");
  if (n.includes("čoko") || n.includes("čokol") || n.includes("cokol")) out.add("cokolada");
  if (n.includes("kysl")) out.add("kysle");
  if (n.includes("mix")) out.add("mix");

  return [...out];
}

async function scrapePage(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const products = [];

  $(".product-miniature, .js-product-miniature").each((_, el) => {
    const nameEl = $(el).find(".product-title a, h2 a, h3 a").first();
    const imgEl = $(el).find("img").first();
    const priceEl = $(el).find(".price, .product-price-and-shipping .price").first();

    const name = nameEl.text().trim();
    const href = nameEl.attr("href") || "";
    const productUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const img =
      imgEl.attr("data-full-size-image-url") ||
      imgEl.attr("data-src") ||
      imgEl.attr("src") ||
      "";

    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : "";
    const price = extractPrice(priceEl.text().trim());

    if (name) {
      products.push({
        name,
        url: productUrl,
        image: imageUrl,
        price
      });
    }
  });

  let nextUrl = null;
  const nextHref =
    $('a[rel="next"]').attr("href") ||
    $(".pagination-next a").attr("href") ||
    $("a.next").attr("href");

  if (nextHref) {
    nextUrl = nextHref.startsWith("http") ? nextHref : `${BASE_URL}${nextHref}`;
  }

  return { products, nextUrl };
}

async function main() {
  const all = [];
  const seen = new Set();

  let url = START_URL;
  let page = 1;

  while (url && page <= 20) {
    const { products, nextUrl } = await scrapePage(url);
    if (!products.length) break;

    for (const item of products) {
      const key = `${item.name}||${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      all.push({
        id: all.length + 1,
        name: { sk: item.name },
        images: item.image ? [item.image] : [],
        priceEUR: item.price || 0,
        url: item.url,
        cat: fallbackCategoriesFromName(item.name)
      });
    }

    url = nextUrl;
    page += 1;
  }

  const outputPath = path.join(process.cwd(), "products.json");
  fs.writeFileSync(outputPath, JSON.stringify(all, null, 2), "utf8");
  console.log(`Hotovo. Uložených produktov: ${all.length}`);
}

main().catch((err) => {
  console.error("Chyba:", err);
  process.exit(1);
});
