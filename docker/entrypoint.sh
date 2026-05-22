#!/bin/sh
set -e
# Substitute ${SPOOLMAN_URL} and ${SPOOLMANSYNC_URL} — leaves nginx $variables untouched.
envsubst '${SPOOLMAN_URL} ${SPOOLMANSYNC_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
