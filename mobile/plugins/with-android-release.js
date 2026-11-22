const { withGradleProperties } = require('expo/config-plugins')

module.exports = function withAndroidRelease(config) {
  return withGradleProperties(config, result => {
    // Keep WorkManager's generated database available during Android startup.
    const key = 'android.enableMinifyInReleaseBuilds'
    const properties = result.modResults.filter(item => item.type !== 'property' || item.key !== key)
    result.modResults = [...properties, { type: 'property', key, value: 'false' }]
    return result
  })
}
