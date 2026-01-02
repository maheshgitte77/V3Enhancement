function slugifyName(name) {
    if (!name || typeof name !== "string") return "";
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function buildNameIdSegment(name, id) {
    const idStr = id ? String(id) : "";
    const slug = slugifyName(name);
    if (slug && idStr) return `${slug}_${idStr}`;
    return idStr || slug || "";
}

module.exports = { slugifyName, buildNameIdSegment };


