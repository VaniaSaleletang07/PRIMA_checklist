#!/bin/sh
set -e

# Named volume mewarisi isi direktori dari image, tapi bind mount tidak. Tanpa ini
# artisan gagal dengan "View path not found" saat storage/ di-bind ke host kosong.
mkdir -p storage/app/private/dokumen storage/app/private/backups \
         storage/framework/cache/data storage/framework/sessions storage/framework/views \
         storage/logs bootstrap/cache

# Image ini dipakai backend, scheduler, dan queue sekaligus. Tanpa penjaga ini
# ketiganya akan menjalankan migrate bersamaan saat compose up dan saling balapan.
if [ "${PRIMA_RUN_MIGRATIONS}" = "true" ]; then
    php artisan migrate --force
    php artisan db:seed --force
fi

if [ "${APP_ENV}" = "production" ]; then
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
else
    php artisan config:clear
    php artisan route:clear
    php artisan view:clear
fi

exec docker-php-entrypoint "$@"
