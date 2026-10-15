#!/usr/bin/env bash
# Download the MPXJ jars Datum uses to read .mpp / .xer / .mpx and the other
# formats MPXJ understands. Jars are not committed (they are large, and MPXJ
# is LGPL-2.1). Java must be installed separately.
#
# Versions match vendor/mpxj/JARS.txt. mpxj.jar itself is MPXJ 16.6.0, the
# release whose library folder lines up with those dependency versions
# (Jackson 2.22.1, jsoup 1.22.2, POI 5.5.1, sqlite-jdbc 3.51.2.0).
#
# Usage: npm run fetch:mpxj
#    or: bash scripts/fetch-mpxj.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/vendor/mpxj"
LIST="$DEST/JARS.txt"
BASE="https://repo1.maven.org/maven2"
MPXJ_VERSION="16.6.0"

if [[ ! -f "$LIST" ]]; then
  echo "Missing $LIST" >&2
  exit 1
fi

mkdir -p "$DEST"

# filename|maven path  (bash 3 compatible: no mapfile)
ROWS="
commons-codec-1.20.0.jar|commons-codec/commons-codec/1.20.0/commons-codec-1.20.0.jar
commons-collections4-4.5.0.jar|org/apache/commons/commons-collections4/4.5.0/commons-collections4-4.5.0.jar
commons-io-2.21.0.jar|commons-io/commons-io/2.21.0/commons-io-2.21.0.jar
commons-lang3-3.18.0.jar|org/apache/commons/commons-lang3/3.18.0/commons-lang3-3.18.0.jar
commons-logging-1.2.jar|commons-logging/commons-logging/1.2/commons-logging-1.2.jar
commons-math3-3.6.1.jar|org/apache/commons/commons-math3/3.6.1/commons-math3-3.6.1.jar
istack-commons-runtime-4.0.1.jar|com/sun/istack/istack-commons-runtime/4.0.1/istack-commons-runtime-4.0.1.jar
jackcess-4.0.10.jar|com/healthmarketscience/jackcess/jackcess/4.0.10/jackcess-4.0.10.jar
jackson-annotations-2.22.jar|com/fasterxml/jackson/core/jackson-annotations/2.22/jackson-annotations-2.22.jar
jackson-core-2.22.1.jar|com/fasterxml/jackson/core/jackson-core/2.22.1/jackson-core-2.22.1.jar
jackson-databind-2.22.1.jar|com/fasterxml/jackson/core/jackson-databind/2.22.1/jackson-databind-2.22.1.jar
jakarta.activation-2.0.1.jar|com/sun/activation/jakarta.activation/2.0.1/jakarta.activation-2.0.1.jar
jakarta.xml.bind-api-3.0.1.jar|jakarta/xml/bind/jakarta.xml.bind-api/3.0.1/jakarta.xml.bind-api-3.0.1.jar
jaxb-core-3.0.2.jar|org/glassfish/jaxb/jaxb-core/3.0.2/jaxb-core-3.0.2.jar
jaxb-runtime-3.0.2.jar|org/glassfish/jaxb/jaxb-runtime/3.0.2/jaxb-runtime-3.0.2.jar
jsoup-1.22.2.jar|org/jsoup/jsoup/1.22.2/jsoup-1.22.2.jar
log4j-api-2.24.3.jar|org/apache/logging/log4j/log4j-api/2.24.3/log4j-api-2.24.3.jar
poi-5.5.1.jar|org/apache/poi/poi/5.5.1/poi-5.5.1.jar
rtfparserkit-1.16.0.jar|com/github/joniles/rtfparserkit/1.16.0/rtfparserkit-1.16.0.jar
SparseBitSet-1.3.jar|com/zaxxer/SparseBitSet/1.3/SparseBitSet-1.3.jar
sqlite-jdbc-3.51.2.0.jar|org/xerial/sqlite-jdbc/3.51.2.0/sqlite-jdbc-3.51.2.0.jar
txw2-3.0.2.jar|org/glassfish/jaxb/txw2/3.0.2/txw2-3.0.2.jar
"

download() {
  local name="$1" path="$2" url="$BASE/$path"
  if [[ -f "$DEST/$name" ]]; then
    echo "have $name"
    return
  fi
  echo "get  $name"
  curl -fsSL --retry 3 -o "$DEST/$name.partial" "$url"
  mv "$DEST/$name.partial" "$DEST/$name"
}

printf '%s\n' "$ROWS" | while IFS='|' read -r name path; do
  [[ -z "$name" ]] && continue
  download "$name" "$path"
done

if [[ ! -f "$DEST/mpxj.jar" ]]; then
  echo "get  mpxj.jar (MPXJ $MPXJ_VERSION)"
  curl -fsSL --retry 3 -o "$DEST/mpxj.jar.partial" \
    "$BASE/net/sf/mpxj/mpxj/${MPXJ_VERSION}/mpxj-${MPXJ_VERSION}.jar"
  mv "$DEST/mpxj.jar.partial" "$DEST/mpxj.jar"
else
  echo "have mpxj.jar"
fi

echo
echo "Checking names listed in JARS.txt"
missing=0
while read -r size name; do
  [[ -z "${name:-}" ]] && continue
  [[ "$name" == \#* ]] && continue
  if [[ ! -f "$DEST/$name" ]]; then
    echo "missing $name" >&2
    missing=1
  fi
done < "$LIST"
if [[ "$missing" -ne 0 ]]; then
  echo "One or more jars from JARS.txt were not downloaded." >&2
  exit 1
fi

cat > "$DEST/LICENSE-NOTES.txt" <<EOF
MPXJ ${MPXJ_VERSION} and the jars next to this file were downloaded by
scripts/fetch-mpxj.sh. They are not part of the Datum source tree.

MPXJ is licensed under the GNU Lesser General Public License v2.1.
https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
https://github.com/joniles/mpxj

Unmodified LGPL jars may sit beside an AGPL-3.0 program. Datum does not
vendor them in git. Other jars use the Apache-2.0, EPL, BSD, or MIT
licenses published with each artifact on Maven Central.

Datum invokes: java -cp vendor/mpxj/* org.mpxj.sample.MpxjConvert
EOF

echo "MPXJ jars are in $DEST"
echo "Confirm Java with: java -version"
