const { withAppBuildGradle } = require('expo/config-plugins')

module.exports = function withWindowsBuildPaths(config) {
  if (process.platform !== 'win32') return config

  return withAppBuildGradle(config, result => {
    const argument = '-DCMAKE_OBJECT_PATH_MAX=245'
    if (!result.modResults.contents.includes(argument)) {
      result.modResults.contents += `
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "${argument}"
            }
        }
    }
}
`
    }
    return result
  })
}
