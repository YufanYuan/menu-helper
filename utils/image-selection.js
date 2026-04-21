function mergeImagePaths(currentPaths, incomingPaths, uploadLimit, mergeMode) {
  const nextPaths = mergeMode === 'replace'
    ? incomingPaths
    : currentPaths.concat(incomingPaths)

  return dedupeImagePaths(nextPaths).slice(0, uploadLimit)
}

function dedupeImagePaths(paths) {
  const seen = new Set()

  return (paths || []).filter((path) => {
    if (!path || seen.has(path)) {
      return false
    }

    seen.add(path)
    return true
  })
}

module.exports = {
  mergeImagePaths,
}
