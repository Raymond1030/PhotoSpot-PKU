const fs = require('fs');
const path = require('path');
const ExifReader = require('exifreader');

// Configuration
const BASE_DIR = path.join(__dirname, '../data/images');
const COVERS_DIR = path.join(__dirname, '../data/images/covers');
const OUTPUT_FILE = path.join(__dirname, '../data/image_manifest.json');
const METADATA_FILE = path.join(__dirname, '../data/image_metadata.json');

// Supported image extensions
const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

/**
 * Extracts the ID from a folder name like "1. 西门" -> "1"
 * @param {string} folderName 
 * @returns {string|null}
 */
function extractId(folderName) {
    const match = folderName.match(/^(\d+)\./);
    return match ? match[1] : null;
}

async function generateManifest() {
    console.log('[Manifest Generator] Scanning images directory...');
    const manifest = {};
    const metadata = {};

    if (!fs.existsSync(BASE_DIR)) {
        console.warn(`[Manifest Generator] Warning: Image directory not found at ${BASE_DIR}`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
        return;
    }

    // Read Area folders
    const areas = fs.readdirSync(BASE_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

    for (const area of areas) {
        const areaId = extractId(area.name);
        if (!areaId) continue;

        const areaPath = path.join(BASE_DIR, area.name);
        const spots = fs.readdirSync(areaPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());

        for (const spot of spots) {
            const spotId = extractId(spot.name);
            if (!spotId) continue;

            const spotPath = path.join(areaPath, spot.name);
            const files = fs.readdirSync(spotPath, { withFileTypes: true });

            const images = [];
            for (const file of files) {
                if (file.isFile() && VALID_EXTENSIONS.has(path.extname(file.name).toLowerCase())) {
                    // Create relative path from the project root
                    // e.g. "data/images/1. 西门/1. 西门正面门匾/image.jpg"
                    const relPath = path.posix.join(
                        'data',
                        'images',
                        area.name,
                        spot.name,
                        file.name
                    );
                    images.push(relPath);

                    // Extract EXIF data
                    try {
                        const tags = await ExifReader.load(path.join(spotPath, file.name));
                        if (tags) {
                            if (tags.Model || tags.ExposureTime || tags.FNumber) {
                                metadata[relPath] = {
                                    Make: tags.Make?.description,
                                    Model: tags.Model?.description,
                                    LensModel: tags.LensModel?.description,
                                    FocalLength: tags.FocalLength?.description,
                                    FNumber: tags.FNumber?.description,
                                    ISO: tags.ISOSpeedRatings?.description,
                                    ExposureTime: tags.ExposureTime?.description
                                };
                            }
                        }
                    } catch (err) {
                        // Suppress error if no EXIF or file unreadable
                    }
                }
            }

            if (images.length > 0) {
                const key = `${areaId}-${spotId}`;
                manifest[key] = images;
            }
        }
    }

    // Scan cover images
    const covers = {};
    if (fs.existsSync(COVERS_DIR)) {
        const coverFiles = fs.readdirSync(COVERS_DIR, { withFileTypes: true });
        for (const file of coverFiles) {
            if (!file.isFile()) continue;
            const ext = path.extname(file.name).toLowerCase();
            if (!VALID_EXTENSIONS.has(ext)) continue;
            // Cover filename format: {areaId}_{areaName}.ext
            const match = file.name.match(/^(\d+)_/);
            if (match) {
                covers[match[1]] = path.posix.join('data', 'images', 'covers', file.name);
            }
        }
    }
    manifest._covers = covers;

    // Write the output files
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    console.log(`[Manifest Generator] Done! Generated manifest for ${Object.keys(manifest).length} spots, ${Object.keys(covers).length} covers.`);
    console.log(`[Manifest Generator] Extracted metadata for ${Object.keys(metadata).length} images.`);
}

generateManifest().catch(err => {
    console.error('[Manifest Generator] Error generating manifest:', err);
    process.exit(1);
});
