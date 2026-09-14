FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader --no-scripts

FROM dunglas/frankenphp:1-php8.2-alpine

# pg_dump/pg_restore dipakai command prima:database-backup dan prima:database-restore.
# curl dipakai healthcheck compose.
RUN apk add --no-cache postgresql-client curl \
    && install-php-extensions pdo_pgsql intl opcache zip

WORKDIR /app

COPY --from=vendor /app/vendor ./vendor
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-prima.ini
COPY docker/entrypoint.sh /usr/local/bin/prima-entrypoint
COPY . .

# SERVER_NAME tanpa hostname (":8000") mematikan auto-HTTPS FrankenPHP.
# TLS diterminasi Caddy di depan, container ini cukup bicara HTTP di network Docker.
# XDG_* harus writable karena proses berjalan sebagai non-root.
ENV SERVER_NAME=:8000 \
    SERVER_ROOT=public/ \
    XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data

RUN chmod +x /usr/local/bin/prima-entrypoint \
    && mkdir -p storage/app/private/dokumen storage/app/private/backups \
                storage/framework/cache storage/framework/sessions storage/framework/views \
                storage/logs bootstrap/cache /config/caddy /data/caddy \
    && chown -R www-data:www-data storage bootstrap/cache /config /data

USER www-data
EXPOSE 8000

ENTRYPOINT ["prima-entrypoint"]
CMD ["--config", "/etc/frankenphp/Caddyfile", "--adapter", "caddyfile"]
