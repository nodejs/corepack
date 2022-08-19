# Changelog

## [0.13.0](https://github.com/nodejs/corepack/compare/v0.12.3...v0.13.0) (2022-08-19)


### Features

* do not use `~/.node` as default value for `COREPACK_HOME` ([#152](https://github.com/nodejs/corepack/issues/152)) ([09e24cf](https://github.com/nodejs/corepack/commit/09e24cf497de27fe92668cf0a8e555f2c7e2530d))
* download the latest version instead of a pinned one ([#134](https://github.com/nodejs/corepack/issues/134)) ([055b928](https://github.com/nodejs/corepack/commit/055b92807f711b5c8c8be6e62b8d3ce83e1ff002))
* update package manager versions ([#163](https://github.com/nodejs/corepack/issues/163)) ([af38d5a](https://github.com/nodejs/corepack/commit/af38d5afbbc10d61265b2f4687c5cc498b059b41))

## [0.12.3](https://github.com/nodejs/corepack/compare/v0.12.2...v0.12.3) (2022-08-12)


### Features

* update package manager versions ([#160](https://github.com/nodejs/corepack/issues/160)) ([ad092a7](https://github.com/nodejs/corepack/commit/ad092a7fb4296143fa5224c04dbd628451b3c158))

## [0.12.2](https://github.com/nodejs/corepack/compare/v0.12.1...v0.12.2) (2022-08-05)

### Features

* update package manager versions ([#154](https://github.com/nodejs/corepack/issues/154)) ([4b95fd3](https://github.com/nodejs/corepack/commit/4b95fd3b926659855970a887c893c10db0b98e5d))

## [0.12.1](https://github.com/nodejs/corepack/compare/v0.12.0...v0.12.1) (2022-07-21)


### Bug Fixes

* **doc:** update DESIGN.md s/engines.pm/packageManager/ ([#141](https://github.com/nodejs/corepack/issues/141)) ([d6039c5](https://github.com/nodejs/corepack/commit/d6039c5b16cdddb33069b9aa864854ed16d17e4e))
* update package manager versions ([#146](https://github.com/nodejs/corepack/issues/146)) ([fdb187a](https://github.com/nodejs/corepack/commit/fdb187a640de77df9b3688623ba510bdafda8702))

## [0.12.0](https://github.com/nodejs/corepack/compare/v0.11.2...v0.12.0) (2022-07-09)


### Features

* add support for hash checking ([#133](https://github.com/nodejs/corepack/issues/133)) ([6a480a7](https://github.com/nodejs/corepack/commit/6a480a72c2e9fc6725f2ab6dfaf4c52e4d3d2ade))
* add support for tags and ranges in `prepare` command ([#136](https://github.com/nodejs/corepack/issues/136)) ([29da06c](https://github.com/nodejs/corepack/commit/29da06c515e917829e5ffbedb34284a6597e9d56))
* update package manager versions ([#129](https://github.com/nodejs/corepack/issues/129)) ([2470f58](https://github.com/nodejs/corepack/commit/2470f58b74491a1301221df643c55be5adf1d349))
* update package manager versions ([#139](https://github.com/nodejs/corepack/issues/139)) ([cd0dcad](https://github.com/nodejs/corepack/commit/cd0dcade85621199048d7ca30dfc3efce11e1f37))


### Bug Fixes

* streamline the cache exploration ([#135](https://github.com/nodejs/corepack/issues/135)) ([185da44](https://github.com/nodejs/corepack/commit/185da44078fd1ca34aec2e4e6f8a52ecffcf3c11))

## [0.11.2](https://github.com/nodejs/corepack/compare/v0.11.1...v0.11.2) (2022-06-13)

### Bug Fixes

* only set bins on pack ([#127](https://github.com/nodejs/corepack/issues/127)) ([7ae489a](https://github.com/nodejs/corepack/commit/7ae489a86c3fe584b9915f4ec57deb7c316c1a25))

## [0.11.1](https://github.com/nodejs/corepack/compare/v0.11.0...v0.11.1) (2022-06-12)


### Bug Fixes

* **ci:** YAML formatting in publish workflow ([#124](https://github.com/nodejs/corepack/issues/124)) ([01c7d63](https://github.com/nodejs/corepack/commit/01c7d638b04a1340b3939a7985e24b586e344995))

## 0.11.0 (2022-06-12)


### Features

* auto setup proxy for http requests ([#69](https://github.com/nodejs/corepack/issues/69)) ([876ce02](https://github.com/nodejs/corepack/commit/876ce02fe7385ea5bc896b2dc93d1fb320361c64))


### Bug Fixes

* avoid symlinks to work on Windows ([#13](https://github.com/nodejs/corepack/issues/13)) ([b56df30](https://github.com/nodejs/corepack/commit/b56df30796da9c7cb0ba5e1bb7152c81582abba6))
* avoid using eval to get the corepack version ([#45](https://github.com/nodejs/corepack/issues/45)) ([78d94eb](https://github.com/nodejs/corepack/commit/78d94eb297444d7558e8b4395f0108c97117f8ab))
* bin file name for pnpm >=6.0 ([#35](https://github.com/nodejs/corepack/issues/35)) ([8ff2499](https://github.com/nodejs/corepack/commit/8ff2499e831c8cf2dea604ea985d830afc8a479e))
* generate cmd shim files ([a900b4d](https://github.com/nodejs/corepack/commit/a900b4db12fcd4d99c0a4d011b426cdc6485d323))
* handle package managers with a bin array correctly ([#20](https://github.com/nodejs/corepack/issues/20)) ([1836d17](https://github.com/nodejs/corepack/commit/1836d17b4fc4c0164df2fe1ccaca4d2f16f6f2d1))
* handle parallel installs ([#84](https://github.com/nodejs/corepack/issues/84)) ([5cfc6c9](https://github.com/nodejs/corepack/commit/5cfc6c9df0dbec8e4de4324be37aa0a54a300552))
* handle prereleases ([#32](https://github.com/nodejs/corepack/issues/32)) ([2a46b6d](https://github.com/nodejs/corepack/commit/2a46b6d13adae139141012254ef670d6ddcb5d11))


### Performance Improvements

* load binaries in the same process ([#97](https://github.com/nodejs/corepack/issues/97)) ([5ff6e82](https://github.com/nodejs/corepack/commit/5ff6e82028e58448ba5ba986854b61ecdc69885b))
