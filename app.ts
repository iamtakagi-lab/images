require("dotenv").config();

if (!process.env.SITE_BASEURL) throw new Error("SITE_BASEURL is not set");
if (!process.env.ADMIN_USER) throw new Error("ADMIN_USER is not set");
if (!process.env.ADMIN_PASS) throw new Error("ADMIN_PASS is not set");
if (!process.env.UPLOAD_LIMIT_MB) throw new Error("UPLOAD_LIMIT_MB is not set");

process.env.TZ = "Asia/Tokyo";

const SITE_BASEURL = process.env.SITE_BASEURL;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const UPLOAD_LIMIT_MB = parseInt(process.env.UPLOAD_LIMIT_MB); // MB

import moment from "moment";
import "moment/locale/ja";

import { name as APP_NAME, version as APP_VERSION } from "./package.json";

import express from "express";
import path from "path";
import fs, { createWriteStream } from "fs";
import multer from "multer";
import auth from "basic-auth";
import compare from "tsscmp";
import axios, { Axios, AxiosError } from "axios";
import { v4 as uuidv4 } from 'uuid';

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
const ALLOWED_FORMATS_REGEX = /\.(gif|jpe?g|tiff?|png|webp|bmp|svg)$/i;
const ALLOWED_FORMATS = ".png .jpg .jpeg .gif .webp .bmp .tiff .svg" as const;

function paginate(array: string[], size: number, index: number) {
  return array.slice((index - 1) * size, index * size);
}

/**
 * 画像ファイルを読み込む
 * @returns string[]
 */
function readSyncImageFiles() {
  return fs
    .readdirSync(path.join(__dirname, "storage"))
    .filter((fileName) => ALLOWED_FORMATS_REGEX.test(fileName))
    .map(
      (fileName) =>
        ({
          fileName,
          time: fs
            .statSync(path.join(__dirname, "storage", fileName))
            .mtime.getTime(),
        } as { fileName: string; time: number })
    )
    .sort((a, b) => b.time - a.time)
    .map((file) => file.fileName); // 最新順にソート
}

app.get("/", (req, res, next) => {
  const { page } = req.query;

  const files = readSyncImageFiles();

  const index = page && typeof page === "string" ? parseInt(page) : 1 as const;

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
  res.setHeader("Content-DPR", "2.0");
  res.send(IndexPage(provider));
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "storage"));
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.originalname.split(".")[0] +
        "-" +
        moment(Date.now()).format("YYYYMMDDHHmmss") +
        file.originalname.match(/\..*$/)![0]
    );
  },
});
const uploader = multer({
  storage,
  limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpg" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/gif" ||
      file.mimetype === "image/webp" ||
      file.mimetype === "image/bmp" ||
      file.mimetype === "image/tiff" ||
      file.mimetype === "image/svg+xml"
    ) {
      cb(null, true);
    } else {
      cb(null, false);
      const err = new Error(
        `サポートされているファイル形式: ${ALLOWED_FORMATS}`
      );
      err.name = "ExtensionError";
      return cb(err);
    }
  },
}).array("images", 4);

function checkAuth(user: string, pass: string) {
  let valid = true;

  valid = compare(user, ADMIN_USER) && valid;
  valid = compare(pass, ADMIN_PASS) && valid;

  return valid;
}

app.post("/upload", (req, res, next) => {
  const credentials = auth(req);
  if (!credentials || !checkAuth(credentials.name, credentials.pass)) {
    res.status(401);
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Access to the staging site", charset="UTF-8"'
    );
    res.end("Access denied");
    return;
  }

  uploader(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      res
        .status(500)
        .send({ error: { message: `Multer uploading error: ${err.message}` } })
        .end();
      return;
    } else if (err) {
      if (err.name == "ExtensionError") {
        res
          .status(413)
          .send({ error: { message: err.message } })
          .end();
      } else {
        res
          .status(500)
          .send({
            error: { message: `unknown uploading error: ${err.message}` },
          })
          .end();
      }
      return;
    }
    res.redirect(SITE_BASEURL);
  });
});

app.get("/upload", (req, res) => {
  const files = readSyncImageFiles();
  res.setHeader("Content-Type", "text/html");
  res.status(201);
  res.send(UploadPage(files));
});

app.get("/delete", (req, res, next) => {
  const { page } = req.query;

  const files = readSyncImageFiles();

  const index = page && typeof page === "string" ? parseInt(page) : 1 as const;

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
  res.setHeader("Content-DPR", "2.0");
  res.send(DeletePage(provider));
});

app.delete("/delete", (req, res, next) => {
  const credentials = auth(req);
  if (!credentials || !checkAuth(credentials.name, credentials.pass)) {
    res.status(401);
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Access to the staging site", charset="UTF-8"'
    );
    res.end("Access denied");
    return;
  }

  const { fileName } = req.query;

  if (!fileName || typeof fileName !== "string") return next();

  // 画像ファイルが存在しない
  if (!fs.existsSync(path.resolve(__dirname, "storage", fileName)))
    return res.status(404).end();

  try {
    // 画像ファイル削除
    fs.unlinkSync(path.resolve(__dirname, "storage", fileName));
  } catch (error) {
    res.status(500).send(error).end();
  }
  res.status(204); // >> 論理削除なら200、物理削除なら204でいけそうです by https://qiita.com/mfykmn/items/02a0b5448228e0b248b3
  res.end();
});

app.get("/i/:fileName", (req, res, next) => {
  const { fileName } = req.params;
  if (!fileName || typeof fileName !== "string") return next();
  if (!ALLOWED_FORMATS_REGEX.test(fileName))
    return res.status(415).send({ error: "Unsupported Media Type" }).end();
  const files = readSyncImageFiles();
  const index = 1 as const;
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
  res.send(ImagePage(fileName, provider));
});

app.get("/url2image", async (req, res, next) => {
  const files = readSyncImageFiles();
  res.setHeader("Content-Type", "text/html");
  res.send(Url2ImagePage(files));
});

app.put("/url2image", async (req, res, next) => {
  const credentials = auth(req);
  if (!credentials || !checkAuth(credentials.name, credentials.pass)) {
    res.status(401);
    res.setHeader(
      "WWW-Authenticate",
      'Basic realm="Access to the staging site", charset="UTF-8"'
    );
    res.end("Access denied");
    return;
  }

  const { url } = req.query;
  if (!url || typeof url !== "string") return next();
  console.log("url: " + url);
  axios({
    method: "get",
    url: url,
    responseType: "stream",
  })
    .then((response) => {
      const contentType = response.headers["content-type"];
      if (!contentType.startsWith("image")) return res.status(500).end();
      const ext = contentType.split("/")[1];
      const destFileName = `${uuidv4()}-${moment(Date.now()).format("YYYYMMDDHHmmss")}.${ext}`
      const writer = createWriteStream(
        path.resolve(
          __dirname,
          "storage",
          destFileName
        )
      );
      response.data.pipe(writer);
      res.status(200).send({imageUrl: `${SITE_BASEURL}/${destFileName}`, fileName: destFileName}).end();
    })
    .catch((err: AxiosError) => {
      console.log(err);
      res.status(500).send({ err }).end();
    });
});

app.use(
  express.static(path.join(__dirname, "storage"), {
    setHeaders: function (res, path) {
      res.setHeader(
        "Cache-Control",
        "max-age=86400, public, stale-while-revalidate"
      );
      res.setHeader("Content-DPR", "2.0");
    },
  })
);

const IndexPage = ({ files, pagination }: ImageProvider) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>images.iamtakagi.net</title>
    <meta
      property="description"
      content="画像配信サーバ"
    />
    <meta
      property="og:title"
      content="images.iamtakagi.net"
    />
    <meta
      property="og:description"
      content="画像配信サーバ"
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
      
      img {
        max-width:20%;
        cursor:pointer;
        transition:0.3s;
      }
      
      img:hover {opacity: 0.7;}
      
      .modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        z-index: 1; /* Sit on top */
        padding-top: 100px; /* Location of the box */
        left: 0;
        top: 0;
        width: 100%; /* Full width */
        height: 100%; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0,0,0); /* Fallback color */
        background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
      }
      
      .modal-content {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
      }
      
      #caption {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
        text-align: center;
        color: #ccc;
        padding: 10px 0;
        height: 150px;
      }
      
      /* Add Animation - Zoom in the Modal */
      .modal-content, #caption {
        animation-name: zoom;
        animation-duration: 0.6s;
      }
      
      @keyframes zoom {
        from {transform:scale(0)}
        to {transform:scale(1)}
      }
      
      /* The Close Button */
      .close {
        position: absolute;
        top: 15px;
        right: 35px;
        color: #f1f1f1;
        font-size: 40px;
        font-weight: bold;
        transition: 0.3s;
      }
      
      .close:hover,
      .close:focus {
        color: #bbb;
        text-decoration: none;
        cursor: pointer;
      }
      
      /* 100% Image Width on Smaller Screens */
      @media only screen and (max-width: 700px){
        .modal-content {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
  <header style="display:flex;flex-direction:column;">
  <section style="margin-bottom:1rem;">
    <h1 style="margin:0;">画像配信サーバ</h1>
    <p style="margin:0;">画像置き場 (?)</p>
  </section>
  <span>画像ファイル数: ${files.length}</span>
  <nav style="display:flex;flex-direction:column;">
    <a href="/upload">画像ファイルをアップロードする (管理者用)</a>
    <a href="/delete">画像ファイルを削除する (管理者用)</a>
    <a href="/url2image">URL を介してサーバで直接ダウンロードする (管理者用)</a>
  </nav>
</header>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem;" />
    <main>
    <section>
    <h2>配信されている画像一覧</h2>
    <div style="display:flex;flex-wrap:wrap;">
      ${pagination.files
        .map((file) => {
          return `<img src="${SITE_BASEURL}/${file}" alt="${file}"></img>`;
        })
        .join("")}
    </div>
    <span style="margin-top:1rem;display:inline-block;">
    ${
      pagination.prev
        ? `<a href="${SITE_BASEURL}?page=${pagination.prev}" style="margin-right:.7rem;"><- 前のページ</a>`
        : ``
    } 
    ${
      pagination.next
        ? `<a href="${SITE_BASEURL}?page=${pagination.next}">次のページ -></a>`
        : ``
    }
  </span>
  </section>
      <div id="modal" class="modal">
        <span class="close">&times;</span>
        <img class="modal-content" id="modal-img" />
        <div id="caption"></div>
      </div>
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
    <script type="text/javascript">
      (() => {
        Array.from(document.getElementsByTagName("img")).map((img) => {
          img.onclick = function () {
            history.pushState(null, null, "/i/" + this.alt);
            const modal = document.getElementById("modal");
            const modalImg = document.getElementById("modal-img");
            const caption = document.getElementById("caption");
            
            modal.style.display = "block";
            modalImg.src = this.src;
            modalImg.alt = this.alt;
            caption.innerText = this.alt;

            const span = document.getElementsByClassName("close")[0];
            span.onclick = function () {
              history.pushState(null, null, "/");
              modal.style.display = "none";
            };
          };
        });
      })();
    </script>
  </body>
</html>
`;

const ImagePage = (
  fileName: string,
  { files, pagination }: ImageProvider
) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>images.iamtakagi.net</title>
    <meta
      property="description"
      content="${fileName}"
    />
    <meta
      property="og:title"
      content="images.iamtakagi.net"
    />
    <meta
      property="og:description"
      content="${fileName}"
    />
    <meta
      property="og:image"
      content="${SITE_BASEURL}/${fileName}"
    />
    <meta name="twitter:card" content="summary_large_image" />
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
      
      img {
        max-width:20%;
        cursor:pointer;
        transition:0.3s;
      }
      
      img:hover {opacity: 0.7;}
      
      .modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        z-index: 1; /* Sit on top */
        padding-top: 100px; /* Location of the box */
        left: 0;
        top: 0;
        width: 100%; /* Full width */
        height: 100%; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0,0,0); /* Fallback color */
        background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
      }
      
      .modal-content {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
      }
      
      #caption {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
        text-align: center;
        color: #ccc;
        padding: 10px 0;
        height: 150px;
      }
      
      /* Add Animation - Zoom in the Modal */
      .modal-content, #caption {
        animation-name: zoom;
        animation-duration: 0.6s;
      }
      
      @keyframes zoom {
        from {transform:scale(0)}
        to {transform:scale(1)}
      }
      
      /* The Close Button */
      .close {
        position: absolute;
        top: 15px;
        right: 35px;
        color: #f1f1f1;
        font-size: 40px;
        font-weight: bold;
        transition: 0.3s;
      }
      
      .close:hover,
      .close:focus {
        color: #bbb;
        text-decoration: none;
        cursor: pointer;
      }
      
      /* 100% Image Width on Smaller Screens */
      @media only screen and (max-width: 700px){
        .modal-content {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
  <header style="display:flex;flex-direction:column;">
  <section style="margin-bottom:1rem;">
    <h1 style="margin:0;">画像配信サーバ</h1>
    <p style="margin:0;">画像置き場 (?)</p>
  </section>
  <span>画像ファイル数: ${files.length}</span>
  <nav style="display:flex;flex-direction:column;">
    <a href="/upload">画像ファイルをアップロードする (管理者用)</a>
    <a href="/delete">画像ファイルを削除する (管理者用)</a>
    <a href="/url2image">URL を介してサーバで直接ダウンロードする (管理者用)</a>
  </nav>
</header>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem;" />
    <main>
    <section>
    <h2>配信されている画像一覧</h2>
    <div style="display:flex;flex-wrap:wrap;">
      ${pagination.files
        .map((file) => {
          return `<img src="${SITE_BASEURL}/${file}" alt="${file}"></img>`;
        })
        .join("")}
    </div>
    <span style="margin-top:1rem;display:inline-block;">
    ${
      pagination.prev
        ? `<a href="${SITE_BASEURL}?page=${pagination.prev}" style="margin-right:.7rem;"><- 前のページ</a>`
        : ``
    } 
    ${
      pagination.next
        ? `<a href="${SITE_BASEURL}?page=${pagination.next}">次のページ -></a>`
        : ``
    }
  </span>
  </section>
      <div id="modal" class="modal">
        <span class="close">&times;</span>
        <img class="modal-content" id="modal-img" />
        <div id="caption"></div>
      </div>
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
    <script type="text/javascript">
      (() => {
        const modal = document.getElementById("modal");
        const modalImg = document.getElementById("modal-img");
        const caption = document.getElementById("caption");
            
        modal.style.display = "block";
        modalImg.src = "${SITE_BASEURL}/${fileName}";
        modalImg.alt = "${fileName}";
        caption.innerText = "${fileName}";

        const span = document.getElementsByClassName("close")[0];
        span.onclick = function () {
          history.pushState(null, null, "/");
          modal.style.display = "none";
        };

        Array.from(document.getElementsByTagName("img")).map((img) => {
          img.onclick = function () {
            history.pushState(null, null, "/i/" + this.alt);
            const modal = document.getElementById("modal");
            const modalImg = document.getElementById("modal-img");
            const caption = document.getElementById("caption");
            
            modal.style.display = "block";
            modalImg.src = this.src;
            modalImg.alt = this.alt;
            caption.innerText = this.alt;

            const span = document.getElementsByClassName("close")[0];
            span.onclick = function () {
              history.pushState(null, null, "/");
              modal.style.display = "none";
            };
          };
        });
      })();
    </script>
  </body>
</html>
`;

const UploadPage = (files: string[]) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>images.iamtakagi.net / 画像ファイルをアップロードする</title>
    <meta property="description" content="画像配信サーバ" />
    <meta property="og:title" content="images.iamtakagi.net / 画像ファイルをアップロードする" />
    <meta
      property="og:description"
      content="画像配信サーバ"
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
      img {
        max-width: 200px;
        cursor:pointer;
        transition:0.3s;
        display: block;
      }
      
      img:hover {opacity: 0.7;}
      
      .modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        z-index: 1; /* Sit on top */
        padding-top: 100px; /* Location of the box */
        left: 0;
        top: 0;
        width: 100%; /* Full width */
        height: 100%; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0,0,0); /* Fallback color */
        background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
      }
      
      .modal-content {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
      }
      
      #caption {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
        text-align: center;
        color: #ccc;
        padding: 10px 0;
        height: 150px;
      }
      
      /* Add Animation - Zoom in the Modal */
      .modal-content, #caption {
        animation-name: zoom;
        animation-duration: 0.6s;
      }
      
      @keyframes zoom {
        from {transform:scale(0)}
        to {transform:scale(1)}
      }
      
      /* The Close Button */
      .close {
        position: absolute;
        top: 15px;
        right: 35px;
        color: #f1f1f1;
        font-size: 40px;
        font-weight: bold;
        transition: 0.3s;
      }
      
      .close:hover,
      .close:focus {
        color: #bbb;
        text-decoration: none;
        cursor: pointer;
      }

      /* The Close Button */
      .delete {
        color: red;
        font-size: 40px;
        font-weight: bold;
        transition: 0.3s;
      }
      
      .delete:hover,
      .delete:focus {
        opacity: 0.5;
        text-decoration: none;
        cursor: pointer;
      }
      
      /* 100% Image Width on Smaller Screens */
      @media only screen and (max-width: 700px){
        .modal-content {
          width: 100%;
        }
      }
      
      img:hover {opacity: 0.7;}
    </style>
  </head>
  <body>
  <header style="display:flex;flex-direction:column;">
  <section style="margin-bottom:1rem;">
    <h1 style="margin:0;">画像配信サーバ</h1>
    <p style="margin:0;">画像置き場 (?)</p>
  </section>
  <span>画像ファイル数: ${files.length}</span>
  <nav style="display:flex;flex-direction:column;">
    <a href="/">インデックスに戻る</a>
    <a href="/upload">画像ファイルをアップロードする (管理者用)</a>
    <a href="/delete">画像ファイルを削除する (管理者用)</a>
    <a href="/url2image">URL を介してサーバで直接ダウンロードする (管理者用)</a>
  </nav>
</header>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem" />
    <main>
      <section>
        <h2>画像ファイルをアップロードする (管理者用)</h2>
        <form action="/upload" method="POST" enctype="multipart/form-data" style="display:flex;flex-direction:column;">
          <div id="preview" style="display:flex; flex-wrap: wrap;"></div>
          <label for="file">アップロードする画像ファイル選択してください (4つまで選択可)</label>
          <input
            type="file"
            multiple="multiple"
            accept="image/*"
            name="images"
            id="file"
          />
          <span>サポートされているファイル形式: ${ALLOWED_FORMATS}</span>
          <button id="clear" type="button">クリア</button>
          <button type="submit">アップロード</button>
        </form>
      </section>
      <div id="modal" class="modal">
        <span class="close">&times;</span>
        <img class="modal-content" id="modal-img">
        <div id="caption"></div>
      </div>
    </main>
    <hr style="margin-top: 1.2rem" />
    <footer style="display: flex; flex-direction: column">
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
    <script type="text/javascript">
    (() => {
      document.getElementById("file").value = "";
      document.getElementById("preview").innerHTML = "";
  
      document.getElementById("clear").addEventListener("click", () => {
        document.getElementById("file").value = "";
        document.getElementById("preview").innerHTML = "";
      });

      function previewImage (file) { 
        const reader = new FileReader();
        const preview = document.getElementById("preview");
        
        reader.onload = function (e) {
          const imageUrl = e.target.result; // 画像のURLはevent.target.resultで呼び出せる
  
          const imgWrapper = document.createElement("div");
          imgWrapper.setAttribute("id", file.name);
          imgWrapper.style.display = "flex";
          imgWrapper.style.flexDirection = "column";

          const detailsWrapper = document.createElement("div");
          detailsWrapper.style.display = "inline-flex";
          detailsWrapper.style.justifyContent = "space-between";
  
          const imgDesc = document.createElement("span");
          imgDesc.innerText = file.name;
          imgDesc.style.fontSize = ".8rem";
  
          const del = document.createElement("span");
          del.style.fontSize = ".8rem";
          del.innerText = "削除";
          del.setAttribute("class", "delete");

          // ファイル選択から指定されたインデックスのファイルを削除する
          function removeFileFromFileList(index) {
            const dt = new DataTransfer()
            const input = document.getElementById('file')
            const { files } = input;
            
            for (let i = 0; i < files.length; i++) {
              const file = files[i]
              if (index !== i)
                dt.items.add(file);
            }
            
            input.files = dt.files // 更新
          }       
  
          del.onclick = function () {
            const files = document.getElementById("file").files
            for (let i = 0; i < files.length; i ++) {
              console.log(files);
              console.log(files[i]);
              console.log(file.name);
              if(file.name === files[i].name) {
                removeFileFromFileList(i)
                document.getElementById(file.name).remove();
              }
            }
          };
  
          const img = document.createElement("img"); // img要素を作成
  
          img.onclick = function () {
            const modal = document.getElementById("modal");
            const modalImg = document.getElementById("modal-img");
            const caption = document.getElementById("caption");
            
            modal.style.display = "block";
            modalImg.src = this.src;
            modalImg.alt = this.alt;
            caption.innerText = this.alt;

            const span = document.getElementsByClassName("close")[0];
            span.onclick = function () {
              modal.style.display = "none";
            };
          }; 
          img.src = imageUrl;
          img.alt = file.name;
  
          imgWrapper.appendChild(img);
          detailsWrapper.appendChild(imgDesc);
          detailsWrapper.appendChild(del);
          imgWrapper.appendChild(detailsWrapper);
          preview.appendChild(imgWrapper);
        };
        reader.readAsDataURL(file);
      }

      function handleFileSelect (e) {
        const files = e.target.files || e.dataTransfer.files;
        if (files.length > 4) {
          alert('画像ファイルは4つまで選択可能です');
        }
        for (let i = 0; i < files.length; i++) {
          previewImage(files[i]);
        }
      }
      document.getElementById("file").addEventListener('change', handleFileSelect);
    })();
    </script>
  </body>
</html>  
`;

const DeletePage = ({ files, pagination }: ImageProvider) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>images.iamtakagi.net / 画像ファイルを削除する</title>
  <meta property="description" content="画像配信サーバ" />
  <meta property="og:title" content="images.iamtakagi.net / 画像ファイルを削除する" />
  <meta
    property="og:description"
    content="画像配信サーバ"
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
      
      img {
        max-width:20%;
        cursor:pointer;
        transition:0.3s;
      }
      
      img:hover {opacity: 0.7;}
      
      .modal {
        display: none; /* Hidden by default */
        position: fixed; /* Stay in place */
        z-index: 1; /* Sit on top */
        padding-top: 100px; /* Location of the box */
        left: 0;
        top: 0;
        width: 100%; /* Full width */
        height: 100%; /* Full height */
        overflow: auto; /* Enable scroll if needed */
        background-color: rgb(0,0,0); /* Fallback color */
        background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
      }
      
      .modal-content {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
      }
      
      #caption {
        margin: auto;
        display: block;
        width: 80%;
        max-width: 700px;
        text-align: center;
        color: #ccc;
        padding: 10px 0;
        height: 150px;
      }
      
      /* Add Animation - Zoom in the Modal */
      .modal-content, #caption {
        animation-name: zoom;
        animation-duration: 0.6s;
      }
      
      @keyframes zoom {
        from {transform:scale(0)}
        to {transform:scale(1)}
      }
      
      /* The Close Button */
      .close {
        position: absolute;
        top: 15px;
        right: 35px;
        color: #f1f1f1;
        font-size: 40px;
        font-weight: bold;
        transition: 0.3s;
      }
      
      .close:hover,
      .close:focus {
        color: #bbb;
        text-decoration: none;
        cursor: pointer;
      }
      
      /* 100% Image Width on Smaller Screens */
      @media only screen and (max-width: 700px){
        .modal-content {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
  <header style="display:flex;flex-direction:column;">
  <section style="margin-bottom:1rem;">
    <h1 style="margin:0;">画像配信サーバ</h1>
    <p style="margin:0;">画像置き場 (?)</p>
  </section>
  <span>画像ファイル数: ${files.length}</span>
  <nav style="display:flex;flex-direction:column;">
    <a href="/">インデックスに戻る</a>
    <a href="/upload">画像ファイルをアップロードする (管理者用)</a>
    <a href="/delete">画像ファイルを削除する (管理者用)</a>
    <a href="/url2image">URL を介してサーバで直接ダウンロードする (管理者用)</a>
  </nav>
</header>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem;" />
    <main>
      <section>
        <h2>画像ファイルを削除する (管理者用)</h2>
        <p>削除したい画像をクリックしてください</p>
        <div style="display:flex;flex-wrap:wrap;">
          ${pagination.files
            .map((file) => {
              return `<img src="${SITE_BASEURL}/${file}" alt="${file}"></img>`;
            })
            .join("")}
        </div>
        <span style="margin-top:1rem;display:inline-block;">
        ${
          pagination.prev
            ? `<a href="${SITE_BASEURL}/delete?page=${pagination.prev}" style="margin-right:.7rem;"><- 前のページ</a>`
            : ``
        } 
        ${
          pagination.next
            ? `<a href="${SITE_BASEURL}/delete?page=${pagination.next}">次のページ -></a>`
            : ``
        }
      </span>
      </section>
      <div id="modal" class="modal">
        <span class="close">&times;</span>
        <img class="modal-content" id="modal-img">
        <div id="caption"></div>
      </div>
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
    <script type="text/javascript">
    (() => {
      Array.from(document.getElementsByTagName("img")).map((img) => {
        img.onclick = function () {
          const modal = document.getElementById("modal");
          const modalImg = document.getElementById("modal-img");
          const caption = document.getElementById("caption");
          
          modal.style.display = "block";
          modalImg.src = this.src;
          caption.innerHTML = this.alt;

          const isConfrimed = window.confirm("この画像ファイルを削除しますか？ (" + this.alt + ")");

          if(isConfrimed) {
            fetch("/delete?fileName=" + this.alt, {method: 'DELETE'}).then((res) => {
              if(res.status === 204) {
                modal.style.display = "none";
                location.reload();
              } else if (res.status === 404 ){
                window.alert("画像ファイルが存在しません (" + JSON.stringfy(res.body) + ")");
              } else if (res.status === 500 ) {
                window.alert("画像ファイル削除に失敗しました (" + JSON.stringfy(res.body) + ")");
              }
            })
          } else {
            modal.style.display = "none";
          }
          
          const span = document.getElementsByClassName("close")[0];
          span.onclick = function () {
            modal.style.display = "none";
          };
        };
      });
    })();
    </script>
  </body>
</html>
`;

export const Url2ImagePage = (files: string[]) => `
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>images.iamtakagi.net / URL を介してサーバで直接ダウンロードする</title>
    <meta property="description" content="画像配信サーバ"" />
    <meta
      property="og:title"
      content="images.iamtakagi.net / URL を介してサーバで直接ダウンロードする"
    />
    <meta property="og:description" content="画像配信サーバ"" />
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
    
    img {
      max-width:20%;
      cursor:pointer;
      transition:0.3s;
    }
    
    img:hover {opacity: 0.7;}
    
    .modal {
      display: none; /* Hidden by default */
      position: fixed; /* Stay in place */
      z-index: 1; /* Sit on top */
      padding-top: 100px; /* Location of the box */
      left: 0;
      top: 0;
      width: 100%; /* Full width */
      height: 100%; /* Full height */
      overflow: auto; /* Enable scroll if needed */
      background-color: rgb(0,0,0); /* Fallback color */
      background-color: rgba(0,0,0,0.9); /* Black w/ opacity */
    }
    
    .modal-content {
      margin: auto;
      display: block;
      width: 80%;
      max-width: 700px;
    }
    
    #caption {
      margin: auto;
      display: block;
      width: 80%;
      max-width: 700px;
      text-align: center;
      color: #ccc;
      padding: 10px 0;
      height: 150px;
    }
    
    /* Add Animation - Zoom in the Modal */
    .modal-content, #caption {
      animation-name: zoom;
      animation-duration: 0.6s;
    }
    
    @keyframes zoom {
      from {transform:scale(0)}
      to {transform:scale(1)}
    }
    
    /* The Close Button */
    .close {
      position: absolute;
      top: 15px;
      right: 35px;
      color: #f1f1f1;
      font-size: 40px;
      font-weight: bold;
      transition: 0.3s;
    }
    
    .close:hover,
    .close:focus {
      color: #bbb;
      text-decoration: none;
      cursor: pointer;
    }
    
    /* 100% Image Width on Smaller Screens */
    @media only screen and (max-width: 700px){
      .modal-content {
        width: 100%;
      }
    }
    </style>
    <script type="text/javascript">
      async function url2image(event) {
        event.preventDefault();
        const submitBtn = document.getElementById("submit_btn")
        submitBtn.disabled = true;
        submitBtn.innerText = "ダウンロード中です...";
        const form = document.querySelector("form");
        const status = document.getElementById("status")
        status.innerText = "サーバ上で画像ファイルをダウンロードしています..."
        const url = document.getElementById("url").value;
        const res = await fetch("/url2image?url=" + encodeURI(url), {method: 'PUT'});
        if (res.status === 200) {
          status.innerText = "サーバ上での画像ダウンロードが完了しました";
          const { imageUrl, fileName } = await res.json()
          const img = document.querySelector("img");
          img.src = imageUrl;
          img.alt = fileName;
        }
        else if (res.status === 500) {
          status.innerText = "サーバ上での画像ダウンロードに失敗しました";
        }
        submitBtn.disabled = false;
        submitBtn.innerText = "実行";
      }

      function showModal() {
        const img = document.querySelector("img");

        const modal = document.getElementById("modal");
        const modalImg = document.getElementById("modal-img");
        const caption = document.getElementById("caption");
          
        modal.style.display = "block";
        modalImg.src = img.src;
        caption.innerHTML = img.alt;

        const span = document.getElementsByClassName("close")[0];
        span.onclick = function () {
          modal.style.display = "none";
        };
      }
    </script>
  </head>
  <body>
    <header style="display:flex;flex-direction:column;">
      <section style="margin-bottom:1rem;">
        <h1 style="margin:0;">画像配信サーバ</h1>
        <p style="margin:0;">画像置き場 (?)</p>
      </section>
      <span>画像ファイル数: ${files.length}</span>
      <nav style="display:flex;flex-direction:column;">
        <a href="/">インデックスに戻る</a>
        <a href="/upload">画像ファイルをアップロードする (管理者用)</a>
        <a href="/delete">画像ファイルを削除する (管理者用)</a>
        <a href="/url2image">URL を介してサーバで直接ダウンロードする (管理者用)</a>
      </nav>
    </header>
    <hr style="margin-top: 1.2rem; margin-bottom: 1.2rem" />
    <main>
      <section>
        <h2>URL を介してサーバで直接ダウンロードする (管理者用)</h2>
        <form
          onsubmit="url2image(event)"
          style="display: flex; flex-direction: column"
        >
          <label for="url"
            >画像の URL を入力してください</label
          >
          <input
            type="text"
            id="url"
          />
          <span>サポートされているファイル形式: ${ALLOWED_FORMATS}</span>
          <button id="submit_btn" type="submit">実行</button>
          <span id="status"></span>
          <img src="" alt="" onclick="showModal()"></img>
        </form>
      </section>
      <div id="modal" class="modal">
        <span class="close">&times;</span>
        <img class="modal-content" id="modal-img">
        <div id="caption"></div>
      </div>
    </main>
    <hr style="margin-top: 1.2rem" />
    <footer style="display: flex; flex-direction: column">
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
</html>
`;


const port = process.env.PORT || 3000;
app.listen(port);
console.log(`[${APP_NAME}/${APP_VERSION}] Listen on ${SITE_BASEURL}`);
