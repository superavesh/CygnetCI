// Copies Docker deployment files into the static export output (./out) after
// `next build`, so `out/` is a self-contained image build context:
//   npm run build && cd out && docker build -t cygnetci-web:latest .
// Runs automatically via the "postbuild" npm script.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "out");

if (!fs.existsSync(outDir)) {
  console.warn("copy-docker-assets: ./out not found, skipping (did `next build` produce output?)");
  process.exit(0);
}

const dockerfile = `# CygnetCI Web - serves the static export in this directory (./out from
# \`npm run build\`) via nginx.
# Build (from inside this directory):  docker build -t cygnetci-web:latest .
FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

fs.writeFileSync(path.join(outDir, "Dockerfile"), dockerfile);
console.log("copy-docker-assets: wrote out/Dockerfile");

fs.copyFileSync(path.join(root, "nginx.conf"), path.join(outDir, "nginx.conf"));
console.log("copy-docker-assets: copied nginx.conf -> out/nginx.conf");
