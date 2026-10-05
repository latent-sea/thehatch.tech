// What is found again, kept only if it changed: the page finds its lists
// again every minute (site.js, keepFresh), and a list set to what it already
// held would draw itself again for nothing.

/** The value given what was found, unless it already holds the same. */
export function renew(value, found) {
  if (JSON.stringify(value.read()) !== JSON.stringify(found)) value.setValue(found);
}
