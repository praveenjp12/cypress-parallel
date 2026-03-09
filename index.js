const fs = require('fs');
const path = require('path');

const NODE_INDEX = Number(process.argv[2] || 0);   // 0-based index of this container
const NODE_TOTAL = Number(process.argv[3] || 1);   // total number of containers
const TEST_FOLDER = process.argv[4] || './cypress/e2e'; // folder to scan

console.log(getSpecFiles().join(','));

function getSpecFiles() {
    const allSpecFiles = traverse(TEST_FOLDER).sort();
    // Round-robin distribution: container i gets files where (index % total) === i
    return allSpecFiles.filter((_, index) => (index % NODE_TOTAL) === NODE_INDEX);
}

function traverse(dir) {
    let files = fs.readdirSync(dir);
    files = files.map(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) return traverse(filePath);
        else if (stats.isFile()) return filePath;
    });
    return files.reduce((all, folderContents) => all.concat(folderContents), []);
}