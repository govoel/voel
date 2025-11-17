import { S3Client } from "bun";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    src: {
      type: "string",
    },
    dest: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (!values.src || !values.dest) {
  console.error("Missing required arguments");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT,
  bucket: process.env.R2_BUCKET,
});

await r2.write(values.dest, Bun.file(values.src));
console.log("Upload complete");
