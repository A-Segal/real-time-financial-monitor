# load-test.sh — Performance/Load testing script for Real-Time Financial Monitor
#
# Uses the real Docker Compose environment. Requires:
#   - Docker Compose running (docker compose up --build -d --scale backend=3)
#   - curl, jq, bc (install via: apt-get install -y curl jq bc)
#
# If jq/bc aren't available, the script falls back to simpler counting.
#
# Usage:
#   chmod +x load-test.sh
#   ./load-test.sh [base_url] [duration_seconds]
#
# Examples:
#   ./load-test.sh http://127.0.0.1:5000 30
#   ./load-test.sh http://127.0.0.1:5000 60
#
# Defaults: base_url=http://127.0.0.1:5000, duration=30

BASE_URL="${1:-http://127.0.0.1:5000}"
DURATION="${2:-30}"
CONCURRENCY="${3:-10}"

echo "============================================================"
echo "  Load Test: Real-Time Financial Monitor"
echo "============================================================"
echo "  Target:       $BASE_URL"
echo "  Duration:     ${DURATION}s"
echo "  Concurrency:  $CONCURRENCY"
echo "  Date:         $(date -Iseconds)"
echo "============================================================"
echo ""

# -------------------------------------------------------------------
# Phase 1: Baseline — health check latency
# -------------------------------------------------------------------
echo "--- Phase 1: Health check baseline ---"

total_time=0
count=0
for i in $(seq 1 5); do
    start=$(date +%s%N)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null)
    end=$(date +%s%N)
    elapsed_ms=$(( (end - start) / 1000000 ))
    total_time=$((total_time + elapsed_ms))
    count=$((count + 1))
    echo "  Request $i: HTTP $http_code, ${elapsed_ms}ms"
done
avg=$((total_time / count))
echo "  Average health check latency: ${avg}ms"
echo ""

# -------------------------------------------------------------------
# Phase 2: Check load balancer — X-Backend-Instance distribution
# -------------------------------------------------------------------
echo "--- Phase 2: Load balancer backend distribution ---"

declare -A instances
for i in $(seq 1 30); do
    instance=$(curl -s -I "$BASE_URL/api/transactions" 2>/dev/null | grep -i "X-Backend-Instance" | sed 's/.*: //' | tr -d '\r')
    if [ -n "$instance" ]; then
        instances["$instance"]=$((instances["$instance"] + 1))
    fi
    sleep 0.1
done

echo "  Backend instance distribution (30 requests):"
for inst in "${!instances[@]}"; do
    echo "    $inst: ${instances[$inst]} requests"
done
echo ""

# -------------------------------------------------------------------
# Phase 3: Load test — concurrent transaction creation
# -------------------------------------------------------------------
echo "--- Phase 3: Load test — concurrent transaction creation ---"

success_count=0
fail_count=0
create_times=()

create_transaction() {
    local id=$1
    local start end elapsed_ms http_code

    start=$(date +%s%N)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/transactions" \
        -H "Content-Type: application/json" \
        -d "{\"amount\":$((RANDOM % 10000 + 1)).$((RANDOM % 100)),\"currency\":\"USD\",\"status\":\"Pending\"}" 2>/dev/null)
    end=$(date +%s%N)
    elapsed_ms=$(( (end - start) / 1000000 ))

    echo "$http_code $elapsed_ms"
}

echo "  Creating transactions with concurrency $CONCURRENCY..."
for batch_start in $(seq 1 $CONCURRENCY $((CONCURRENCY * 5))); do
    batch_end=$((batch_start + CONCURRENCY - 1))
    pids=""

    for i in $(seq $batch_start $batch_end); do
        create_transaction $i &
        pids="$pids $!"
    done

    for pid in $pids; do
        wait "$pid" 2>/dev/null
    done
done

echo "  (Phase 3 results in Phases 4-6 below)"
echo ""

# -------------------------------------------------------------------
# Phase 4: Sustained load test
# -------------------------------------------------------------------
echo "--- Phase 4: Sustained load test (${DURATION}s) ---"

start_time=$(date +%s)
elapsed=0
total_requests=0
successful_creates=0
successful_updates=0
failed_requests=0
total_latency=0
min_latency=99999
max_latency=0

# Pre-create transactions for status updates
echo "  Preparing transactions for updates..."
txn_ids=""
for i in $(seq 1 20); do
    response=$(curl -s -X POST "$BASE_URL/api/transactions" \
        -H "Content-Type: application/json" \
        -d "{\"amount\":$((RANDOM % 10000 + 1)).$((RANDOM % 100)),\"currency\":\"USD\",\"status\":\"Pending\"}" 2>/dev/null)
    txn_id=$(echo "$response" | grep -o '"transactionId":"[^"]*"' | head -1 | sed 's/"transactionId":"//;s/"//')
    if [ -n "$txn_id" ]; then
        txn_ids="$txn_ids $txn_id"
    fi
done
echo "  Prepared $(echo "$txn_ids" | wc -w) transactions"
echo ""

echo "  Running sustained load..."
while [ "$elapsed" -lt "$DURATION" ]; do
    case $((RANDOM % 3)) in
        0|1)
            # Create transaction
            start=$(date +%s%N 2>/dev/null || echo "0")
            http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/transactions" \
                -H "Content-Type: application/json" \
                -d "{\"amount\":$((RANDOM % 10000 + 1)).$((RANDOM % 100)),\"currency\":\"USD\",\"status\":\"Pending\"}" 2>/dev/null)
            end=$(date +%s%N 2>/dev/null || echo "0")
            ;;
        2)
            # Update transaction status
            txn=$(echo "$txn_ids" | tr ' ' '\n' | shuf | head -1)
            if [ -n "$txn" ] && [ "$txn" != " " ]; then
                start=$(date +%s%N 2>/dev/null || echo "0")
                http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE_URL/api/transactions/${txn}/status" \
                    -H "Content-Type: application/json" \
                    -d "{\"status\":\"Completed\"}" 2>/dev/null)
                end=$(date +%s%N 2>/dev/null || echo "0")
                # Remove used transaction from pool
                txn_ids=$(echo "$txn_ids" | sed "s/$txn//")
            else
                continue
            fi
            ;;
    esac

    if [ -n "$start" ] && [ "$start" != "0" ]; then
        latency_ms=$(( (end - start) / 1000000 ))
        total_latency=$((total_latency + latency_ms))
        [ "$latency_ms" -lt "$min_latency" ] && min_latency=$latency_ms
        [ "$latency_ms" -gt "$max_latency" ] && max_latency=$latency_ms
    fi

    total_requests=$((total_requests + 1))
    if [ "$http_code" = "201" ] || [ "$http_code" = "204" ]; then
        if [ "$http_code" = "201" ]; then
            successful_creates=$((successful_creates + 1))
        else
            successful_updates=$((successful_updates + 1))
        fi
    else
        failed_requests=$((failed_requests + 1))
    fi

    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
done

# Calculate results
avg_latency=0
if [ "$total_requests" -gt 0 ]; then
    avg_latency=$((total_latency / total_requests))
fi
total_success=$((successful_creates + successful_updates))
error_rate=$(echo "scale=2; $failed_requests * 100 / $total_requests" | bc 2>/dev/null || echo "N/A")
throughput=$(echo "scale=1; $total_requests / $DURATION" | bc 2>/dev/null || echo "N/A")

echo ""
echo "--- Results ---"
echo "  Total requests:       $total_requests"
echo "  Successful creates:   $successful_creates"
echo "  Successful updates:   $successful_updates"
echo "  Failed:               $failed_requests"
echo "  Error rate:           ${error_rate}%"
echo "  Throughput:           ${throughput} req/s"
echo "  Avg latency:          ${avg_latency}ms"
echo "  Min latency:          ${min_latency}ms"
echo "  Max latency:          ${max_latency}ms"
echo ""

# -------------------------------------------------------------------
# Phase 5: Sticky session verification
# -------------------------------------------------------------------
echo "--- Phase 5: Sticky session verification ---"

echo "  Sending requests with signalr_id cookie..."
COOKIE="signalr_id=test-session-12345"
prev_instance=""
sticky_hit=0
sticky_miss=0

for i in $(seq 1 10); do
    instance=$(curl -s -I --cookie "$COOKIE" "$BASE_URL/sticky-test" 2>/dev/null | grep -i "X-Backend-Instance" | sed 's/.*: //' | tr -d '\r')
    if [ -n "$prev_instance" ] && [ "$instance" = "$prev_instance" ]; then
        sticky_hit=$((sticky_hit + 1))
    elif [ -n "$prev_instance" ]; then
        sticky_miss=$((sticky_miss + 1))
    fi
    prev_instance="$instance"
done

echo "  Sticky session hits:  $sticky_hit"
echo "  Sticky session misses: $sticky_miss"
echo "  Sticky reliability:   $(( sticky_hit * 100 / (sticky_hit + sticky_miss) ))%"
echo ""

# -------------------------------------------------------------------
# Phase 6: /lb-health check
# -------------------------------------------------------------------
echo "--- Phase 6: Load balancer health ---"

lb_health=$(curl -s "$BASE_URL/lb-health" 2>/dev/null)
echo "  /lb-health: $lb_health"
echo ""

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
echo "============================================================"
echo "  Load Test Complete"
echo "============================================================"
echo "  Target:       $BASE_URL"
echo "  Duration:     ${DURATION}s"
echo "  Concurrency:  $CONCURRENCY"
echo "  Throughput:   ${throughput} req/s"
echo "  Error rate:   ${error_rate}%"
echo "  Avg latency:  ${avg_latency}ms"
echo "============================================================"
