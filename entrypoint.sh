#!/bin/sh

while :
do
  pnpm start || true

  # wait 10 minutes
  echo Waiting 10 minutes...
  sleep 600
done
