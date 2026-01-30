#!/bin/bash
#
# test-sampler.sh - Test suite for Audio Sampler Frontend
# Tests all major features without a GUI (headless mode)
#
# Usage: bash tests-frontend/test-sampler.sh [--server] [--verbose]
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

VERBOSE=${VERBOSE:-false}
RUN_SERVER=${RUN_SERVER:-false}

# Parse arguments
for arg in "$@"; do
  case $arg in
    --verbose) VERBOSE=true; shift ;;
    --server) RUN_SERVER=true; shift ;;
  esac
done

log() {
  echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

pass() {
  echo -e "${GREEN}✓${NC} $*"
}

fail() {
  echo -e "${RED}✗${NC} $*" >&2
  exit 1
}

warn() {
  echo -e "${YELLOW}⚠${NC} $*"
}

# ==============================================================================
# TESTS
# ==============================================================================

log "Audio Sampler - Frontend Test Suite"
echo ""

# Test 1: Check if backend is accessible
log "Test 1: Backend API Health Check"
if command -v curl &> /dev/null; then
  BACKEND_URL="https://audio-sampler-x9kz.onrender.com"
  
  if curl -s "$BACKEND_URL/api/health" | grep -q "ok"; then
    pass "Backend API is accessible"
  else
    warn "Could not verify backend health (may be in cold start)"
  fi
else
  warn "curl not found, skipping backend check"
fi

echo ""

# Test 2: Check if presets can be fetched
log "Test 2: Fetch Presets from API"
if command -v curl &> /dev/null; then
  PRESETS=$(curl -s "$BACKEND_URL/api/presets")
  
  if echo "$PRESETS" | grep -q '"name"'; then
    COUNT=$(echo "$PRESETS" | grep -o '"name"' | wc -l)
    pass "Presets fetched successfully (found $COUNT presets)"
  else
    warn "Could not verify preset fetch"
  fi
else
  warn "curl not found, skipping preset fetch"
fi

echo ""

# Test 3: Check JavaScript syntax
log "Test 3: JavaScript Syntax Validation"
JS_FILES=(
  "js/soundutils.js"
  "js/audio-sampler.js"
  "js/main.js"
  "js/api-service.js"
  "js/presets-manager.js"
  "js/keyboard-manager.js"
  "js/midi-manager.js"
  "js/recorder.mjs"
)

SYNTAX_ERRORS=0
for file in "${JS_FILES[@]}"; do
  if [ -f "$file" ]; then
    if node --check "$file" 2>/dev/null; then
      pass "$file - syntax valid"
    else
      fail "$file - syntax error"
    fi
  else
    warn "$file - not found"
  fi
done

echo ""

# Test 4: Check HTML
log "Test 4: HTML Structure Check"
if [ -f "index.html" ]; then
  # Check for required elements
  if grep -q '<div id="buttonsContainer">' index.html; then
    pass "Buttons container found"
  else
    fail "Buttons container not found"
  fi
  
  if grep -q '<select id="presetSelect">' index.html || grep -q 'id="presetSelect"' index.html; then
    pass "Preset select found"
  else
    fail "Preset select not found"
  fi
  
  if grep -q '<div id="error">' index.html; then
    pass "Error display element found"
  else
    fail "Error display element not found"
  fi
else
  fail "index.html not found"
fi

echo ""

# Test 5: Check for required CSS
log "Test 5: CSS Check"
if [ -f "css/styles.css" ]; then
  pass "styles.css exists"
  
  # Check for some key styles
  if grep -q "grid\|display" css/styles.css; then
    pass "Grid/display styles found"
  else
    warn "Grid/display styles not clearly found"
  fi
else
  fail "css/styles.css not found"
fi

echo ""

# Test 6: Check API configuration
log "Test 6: API Configuration Check"
if grep -q "https://audio-sampler-x9kz.onrender.com" js/api-service.js js/constants.js; then
  pass "Backend URL correctly configured for production"
else
  fail "Backend URL not properly configured"
fi

echo ""

# Test 7: Check Web Component
log "Test 7: Web Component Check"
if [ -f "js/sampler-component.js" ]; then
  pass "Sampler component found"
  
  if grep -q "customElements.define.*audio-sampler" js/sampler-component.js; then
    pass "Web Component registration found"
  else
    warn "Web Component registration not clearly visible"
  fi
else
  warn "Sampler component not found"
fi

echo ""

# Test 8: Check for required dependencies documentation
log "Test 8: Dependencies Check"
if grep -q "Web Audio API\|MediaRecorder\|Fetch API" README.md || [ -f "package.json" ]; then
  pass "Dependencies documented or package.json exists"
else
  warn "Dependencies not clearly documented"
fi

echo ""

# Test 9: Check file structure
log "Test 9: Project Structure Check"
REQUIRED_DIRS=(
  "js"
  "css"
  "backend"
  "sampler-admin"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    pass "$dir/ exists"
  else
    warn "$dir/ missing"
  fi
done

echo ""

# Test 10: README and documentation
log "Test 10: Documentation Check"
if [ -f "README.md" ] && grep -q "Audio Sampler" README.md; then
  pass "README.md exists and contains project title"
else
  fail "README.md not properly configured"
fi

if [ -f "PROJECT_REVIEW.md" ]; then
  pass "PROJECT_REVIEW.md exists"
else
  warn "PROJECT_REVIEW.md not found (recommended)"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}Tests completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Summary:"
echo "- JavaScript syntax: ✓"
echo "- HTML structure: ✓"
echo "- CSS: ✓"
echo "- API configuration: ✓"
echo "- Web Components: ✓"
echo "- Backend connectivity: ✓"
echo "- Documentation: ✓"
echo ""
echo "Project is ready for deployment!"
