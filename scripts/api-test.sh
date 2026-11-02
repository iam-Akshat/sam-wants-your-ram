#!/usr/bin/env bash
# Exercises the API of a running server: PORT=8099 scripts/api-test.sh
B=http://127.0.0.1:${PORT:-8088}
echo "stats:"; curl -s $B/api/stats; echo
echo "submit ok:"; curl -s -XPOST $B/api/score -d '{"nickname":"tester","gb":48,"duration":60}'; echo
echo "immediate resubmit (rate limit expected):"; curl -s -XPOST $B/api/score -d '{"nickname":"tester","gb":48,"duration":60}'; echo
echo "cheat (implausible expected):"; curl -s -XPOST $B/api/score -d '{"nickname":"cheat","gb":99999,"duration":20}'; echo
echo "oversize body:"; curl -s -o /dev/null -w "%{http_code}\n" -XPOST $B/api/score -d "$(head -c 5000 /dev/zero | tr '\0' x)"
echo "leaderboard:"; curl -s $B/api/leaderboard; echo
echo "index og tags:"; curl -s -H 'X-Forwarded-Host: sam.example.com' -H 'X-Forwarded-Proto: https' $B/ | grep -o 'og:image[^>]*' | head -2
echo "oversize run duration (rejected expected):"; curl -s -XPOST $B/api/score -d '{"nickname":"cheat","gb":130000,"duration":7200}'; echo
