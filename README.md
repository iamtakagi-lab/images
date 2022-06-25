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

### Supporting Media Formats
- PNG 
- JPEG 
- GIF
- WebP
- BMP
- TIFF 
- SVG

### Upload Limit
.env にて適宣設定

## LICENSE
MIT License.