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
- npm for dependency management

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

### Running the paste preview app
Start the lightweight development server for the paste preview interface (the app with the two text areas) with:

```bash
npm start
```

This serves the app at [http://localhost:5173](http://localhost:5173). The left text area accepts raw HTML, while the right pane shows the structured record and provenance information extracted from the pasted content.

### Command-line demo
Run the console demo against the sample fixture with:

```bash
npm run demo
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
