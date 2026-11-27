# 方言プラグイン 省メモリ Docker 実機検証ガイド（Linux / VPC 対応）

ホスト PC / VPC 上の Linux VM のメモリを圧迫しないよう、**DBMS ごとに独立した `docker-compose.<dbms>.yml`** を用意しています。
同時に起動するコンテナは 1 つだけに絞って「起動 → 検証 → 停止（削除）」を行ってください。

## 対応ファイル一覧
| ターゲット | Compose ファイル | 使用イメージ | メモリ上限 |
|---|---|---|---|
| `postgres` | `docker-compose.postgres.yml` | `postgres:16-alpine` | 256MB |
| `mysql` | `docker-compose.mysql.yml` | `mysql:8.0`（省メモリ設定） | 512MB |
| `oracle` | `docker-compose.oracle.yml` | `gvenzl/oracle-free:23-slim-faststart` | 2GB |
| `mssql` | `docker-compose.mssql.yml` | `mcr.microsoft.com/mssql/server:2022-latest` (Express) | 2GB |
| `spanner` | `docker-compose.spanner.yml` | `gcr.io/cloud-spanner-emulator/emulator` | 256MB |

## 検証手順（Linux / VPC 上で実行）

### 1. PostgreSQL
```bash
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.postgres.yml up -d
node dbml-editor-plugin/tests/docker-verify/verify-ddl.mjs postgres
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.postgres.yml down -v
```

### 2. MySQL
```bash
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.mysql.yml up -d
node dbml-editor-plugin/tests/docker-verify/verify-ddl.mjs mysql
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.mysql.yml down -v
```

### 3. Oracle 23 Free (`faststart`)
```bash
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.oracle.yml up -d
# 初回起動後、healthcheck が healthy になるまで 10〜20 秒待機
node dbml-editor-plugin/tests/docker-verify/verify-ddl.mjs oracle
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.oracle.yml down -v
```

### 4. SQL Server (Express)
```bash
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.mssql.yml up -d
# 起動後、SQL Server の待ち受け開始まで 10〜15 秒待機
node dbml-editor-plugin/tests/docker-verify/verify-ddl.mjs mssql
docker compose -f dbml-editor-plugin/tests/docker-verify/docker-compose.mssql.yml down -v
```
