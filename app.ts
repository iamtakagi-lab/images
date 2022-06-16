require("dotenv").config();

if (!process.env.SITE_BASEURL) throw new Error("SITE_BASEURL is not set");

import { name as APP_NAME, version as APP_VERSION } from "./package.json";
import express from "express";
import path from "path";
import fs from "fs";

const SITE_BASEURL = process.env.SITE_BASEURL;

const app = express();

interface Pagination {
  index: number;
  size: number;
  prev: number | null;
  next: number | null;
  files: string[];
}

interface ImageProvider {
  files: string[];
  pagination: Pagination;
}

const PAGE_SIZE = 20 as const;

function paginate(array: string[], size: number, index: number) {
  return array.slice((index - 1) * size, index * size);
}

app.get("/", (req, res, next) => {
  const { page } = req.query;

  const files = fs
    .readdirSync(path.join(__dirname, "images"))
    .filter((file) => /\.(gif|jpe?g|tiff?|png|webp|bmp)$/i.test(file));

  const index = page && typeof page === "string" ? parseInt(page) : 1;

  const paginated = paginate(files, PAGE_SIZE, index);
  const prevPaginated = paginate(files, PAGE_SIZE, index - 1);
  const nextPaginated = paginate(files, PAGE_SIZE, index + 1);
  const pagination = {
    index,
    size: PAGE_SIZE,
    prev: prevPaginated.length != 0 ? index - 1 : null,
    next: nextPaginated.length != 0 ? index + 1 : null,
    files: paginated,
  };
  const provider = { files, pagination };
  res.setHeader("Content-Type", "text/html");
  //res.setHeader("Cache-Control", "max-age=86400, public, stale-while-revalidate");
  res.setHeader("Content-DPR", "2.0");
  res.send(document(provider));
});

const document = ({ files, pagination }: ImageProvider) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>images.iamtakagi.net</title>
    <meta
      property="description"
      content="画像を静的配信するだけのサーバー"
    />
    <meta
      property="og:title"
      content="images.iamtakagi.net"
    />
    <meta
      property="og:description"
      content="画像を静的配信するだけのサーバー"
    />
    <style>
      h1 {
        font-size: 1.3rem;
      }
      h2 {
        font-size: 1.2rem;
      }
      h3 {
        font-size: 1.1rem;
      }
      table {
        border-collapse: collapse;
      }
      table,
      th,
      td {
        border: 1px solid gray;
      }
      th,
      td {
        padding: 8px;
      }
    </style>
  </head>
  <body>
    <nav style="display:flex;flex-direction:column;">
      <section style="margin-bottom:1rem;">
        <h1 style="margin:0;">画像を静的配信するだけのサーバー</h1>
        <p style="margin:0;">画像置き場(?)</p>
      </section>
      <span>画像ファイル数: ${files.length}</span>
    </nav>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem;" />
    <main>
      <div style="display:flex;flex-wrap:wrap;>
        ${pagination.files
          .map((file) => {
            return `<img src="${SITE_BASEURL}/${file}" alt="" style="max-width:20%;"></img>`;
          })
          .join("")}
      </div>
      <span style="margin-top:1rem;display:inline-block;">
        ${
          pagination.prev
            ? `<a href="${SITE_BASEURL}?page=${pagination.prev}" style="margin-right:.7rem;"><- 前 (Prev)</a>`
            : ``
        } ${
  pagination.next
    ? `<a href="${SITE_BASEURL}?page=${pagination.next}">次 (Next) -></a>`
    : ``
}
      </span>
    </main>
    <hr style="margin-top: 1.2rem" />
    <footer style="display: flex; flex-direction: column;">
      <span>
        GitHub:
        <a href="https://github.com/iamtakagi/images">
          https://github.com/iamtakagi/images
        </a>
      </span>
      <span>
        Author: <a href="https://github.com/iamtakagi">iamtakagi</a>
      </span>
      <span>© iamtakagi.net</span>
    </footer>
  </body>
  </body>
</html>
`;

app.use(express.static(path.join(__dirname, "static")));

const port = process.env.PORT || 3000;
app.listen(port);
console.log(`[${APP_NAME}/${APP_VERSION}] Listen on http://localhost:${port}`);
