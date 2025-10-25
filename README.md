# KinGraph

KinGraph is an entity resolution and family linkage engine for genealogical data built with Node.js, React, and TypeScript. The project provides utilities for normalizing historical records, matching related entities, and rendering interactive data visualizations.

## Features
- **Record extraction utilities** for parsing genealogical sources into structured data.
- **Confidence scoring tools** that help quantify the quality of potential matches.
- **Date and location helpers** for standardizing inconsistent historical inputs.
- **Visualization components** that surface insights through responsive charts and diagrams.

## Getting Started

### Prerequisites
- Node.js (version 18 or later is recommended)
- pnpm or npm for dependency management

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the packages:
   ```bash
   npm run build
   ```

### Running Tests
Execute the unit test suite with:
```bash
npm test
```

## Project Structure
- `src/` – Core library code for entity resolution, record extraction, and visualization helpers.
- `apps/` – Example front-end applications that demonstrate KinGraph capabilities.
- `tests/` – Additional integration and regression tests.

## Contributing
Contributions are welcome! Feel free to open an issue or submit a pull request describing your proposed changes. Please include relevant tests and documentation updates where applicable.

## License
This project is licensed under the MIT License.
