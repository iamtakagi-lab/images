# images
画像配信サーバです

## Get Started
```console
$ docker-compose up -d
```

### 構成例 (docker-compose.yml)
```yml
version: '3.8'
services:
  app:
    container_name: images
    image: ghcr.io/iamtakagi/images:latest
    build: 
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./storage:/app/storage
    env_file:
      - .env
    environment:
      - TZ=Asia/Tokyo
      - LANG=ja_JP.UTF-8
      - PORT=3000
    ports:
      - 3000:3000
```

### 環境変数を設定 (.env)
```env
ADMIN_USER=hoge
ADMIN_PASS=foo
SITE_BASEURL=https://foo.com
```

### Run Development Server
```console
$ yarn dev
```

### Build with Webpack
```console
$ yarn build
```

### Start as Production Mode
```console
$ node app.js
```

## Features

### 対応ファイル形式
- PNG 
- JPEG 
- GIF
- WebP
- BMP
- TIFF 
- SVG

### アップロードサイズ
上限 4MB に設定してあります。変更が必要な場合は [app.ts](app.ts) 内で適宣修正してください。

## LICENSE
MIT License.