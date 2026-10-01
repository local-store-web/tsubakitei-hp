import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "data", "menu.json");
const deliSourcePath = path.join(root, "data", "deli-menu.json");
const outputPath = path.join(root, "data", "microcms-menu-import.csv");
const tsubakiteiOutputPath = path.join(root, "data", "microcms-tsubakitei-menus-import.csv");
const deliOutputPath = path.join(root, "data", "microcms-deli-menus-import.csv");

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const deliSource = JSON.parse(fs.readFileSync(deliSourcePath, "utf8"));

const headers = [
  "visible",
  "store",
  "menuId",
  "sectionName",
  "sectionDescription",
  "sortOrder",
  "name",
  "description",
  "price",
  "priceText",
  "imagePath",
  "image"
];
const tsubakiteiHeaders = [
  "visible",
  "sortOrder",
  "menuId",
  "sectionName",
  "subsectionName",
  "name",
  "sectionDescription",
  "priceText",
  "image",
  "imagePath"
];
const deliHeaders = [
  "visible",
  "sortOrder",
  "name",
  "priceText",
  "image",
  "imagePath"
];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function variantText(item) {
  if (!Array.isArray(item.variants) || item.variants.length === 0) return "";
  return item.variants
    .map((variant) => `${variant.name} ￥${Number(variant.price).toLocaleString("ja-JP")}`)
    .join(" / ");
}

function priceText(item) {
  if (item.priceText) return item.priceText;
  const variant = variantText(item);
  if (variant) return variant;
  if (item.price && Number(item.price) > 0) return `￥${Number(item.price).toLocaleString("ja-JP")}`;
  return "";
}

function menuIdLabel(menuId) {
  if (menuId === "dinner-menu") return "Dinner";
  if (menuId === "course-menu") return "Course";
  return "Lunch";
}

const rows = [];
const tsubakiteiRows = [];
const deliRows = [];
let sortOrder = 10;

for (const menu of source.menus || []) {
  for (const section of menu.sections || []) {
    const items = section.items || [];
    if (!items.length && (section.name || section.description)) {
      const row = {
        visible: "TRUE",
        store: source.store || "tsubakitei",
        menuId: menu.id,
        sectionName: section.name || "",
        sectionDescription: section.description || "",
        sortOrder,
        name: "",
        description: "",
        price: "",
        priceText: "",
        imagePath: "",
        image: ""
      };
      rows.push(row);
      tsubakiteiRows.push({
        visible: row.visible,
        sortOrder: row.sortOrder,
        menuId: menuIdLabel(row.menuId),
        sectionName: row.sectionName,
        subsectionName: item.subsectionName || "",
        name: row.name,
        sectionDescription: row.sectionDescription,
        priceText: row.priceText,
        image: row.image,
        imagePath: row.imagePath
      });
      sortOrder += 10;
    }
    for (const item of items) {
      const row = {
        visible: "TRUE",
        store: source.store || "tsubakitei",
        menuId: menu.id,
        sectionName: section.name || "",
        sectionDescription: section.description || "",
        sortOrder,
        name: item.name || "",
        description: item.description || "",
        price: item.price || "",
        priceText: priceText(item),
        imagePath: item.image || "",
        image: ""
      };
      rows.push(row);
      tsubakiteiRows.push({
        visible: row.visible,
        sortOrder: row.sortOrder,
        menuId: menuIdLabel(row.menuId),
        sectionName: row.sectionName,
        name: row.name,
        sectionDescription: [row.sectionDescription, row.description].filter(Boolean).join("\n"),
        priceText: row.priceText,
        image: row.image,
        imagePath: row.imagePath
      });
      sortOrder += 10;
    }
  }
}

for (const item of deliSource.items || []) {
  const row = {
    visible: item.visible === false ? "FALSE" : "TRUE",
    store: deliSource.store || "deli",
    menuId: "deli",
    sectionName: "ツバキ&デリ メニュー",
    sectionDescription: "",
    sortOrder: item.sortOrder || sortOrder,
    name: item.name || "coming soon...",
    description: item.description || "",
    price: item.price || "",
    priceText: item.priceText || "￥...",
    imagePath: item.imagePath || "",
    image: ""
  };
  rows.push(row);
  deliRows.push({
    visible: row.visible,
    sortOrder: row.sortOrder,
    name: row.name,
    priceText: row.priceText,
    image: row.image,
    imagePath: row.imagePath
  });
  sortOrder += 10;
}

function buildCsv(csvHeaders, csvRows) {
  return [
    csvHeaders.join(","),
    ...csvRows.map((row) => csvHeaders.map((header) => csvCell(row[header])).join(","))
  ].join("\n") + "\n";
}

const csv = buildCsv(headers, rows);
const tsubakiteiCsv = buildCsv(tsubakiteiHeaders, tsubakiteiRows);
const deliCsv = buildCsv(deliHeaders, deliRows);

fs.writeFileSync(outputPath, csv, "utf8");
fs.writeFileSync(tsubakiteiOutputPath, tsubakiteiCsv, "utf8");
fs.writeFileSync(deliOutputPath, deliCsv, "utf8");
console.log(`Wrote ${rows.length} rows to ${outputPath}`);
console.log(`Wrote ${tsubakiteiRows.length} rows to ${tsubakiteiOutputPath}`);
console.log(`Wrote ${deliRows.length} rows to ${deliOutputPath}`);
