# YouTube Timecode Normalizer Extension

Chrome extension for normalizing YouTube video timecode URLs to `t=seconds`.

## Structure

- `extension/`: Chrome Manifest V3 extension source.
- `test/cases/real/`: Real-world wiki source test cases.
- `tools/`: Node.js scripts for analyzing test cases.

## Install Locally

1. Open `chrome://extensions/`.
2. Enable Developer Mode.
3. Choose "Load unpacked".
4. Select the `extension/` directory.

## Test

Run the aggregate real-case analyzer from this repository root:

```powershell
node tools/analyze_all_test_cases.js
```

## License

MIT

この拡張機能はOpenAI Codexにより作成されました
