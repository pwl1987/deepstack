import fs from "node:fs";
fs.writeFileSync(".qg-marker", `${Date.now()}\n`);