'use strict';
    
const ART_WIDE = String.raw`
▄▄▄▄▄▄▄▄▄▄ ▄▄▄▄▄ ▄▄▄▄▄  ▄▄▄▄▄▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄  ▄▄▄▄ ▄▄▄▄   ▄▄▄▄▄▄▄▄▄▄
█▄█████████ █████ █████ █▄███████▄█ █▄█████████ █████ █████ ███████████
█▓▓▓▓▓▓▓▓▓█ █▓▓▓█ █▓▓▓█ █▓▓▓▓▓▓▓▓▓█ █▓▓▓▓▓▓▓▓▓█ █▓▓▓█ █▓▓▓█ █▓▓▓▓▓▓▓▓▓█
█▒▒▒█▀█▒▒▒█ █▒▒▒█ █▒▒▒█ █▒▒▒█▀█▒▒▒█ █▒▒▒█▀█▒▒▒█ █▒▒▒█ █▒▒▒█ █▒▒▒█▀█▒▒▒█
█░░░█▄██▀▀▀ █░░░█▄█░░░█ █░░░█ █░░░█ █░░░█▄█▀▀▀▀ █░░░█▄█░░░█ █░░░█ ▀▀▀▀▀
█░░░░░░█    █▀▀▀▀▀▀░░░█ █░░░█ █░░░█ █░░░░░█▄▄▄▄ █▄░░░░░░░▄█ █░░░█      
█▒▒▒▒▒▒█    █▒▒▒█▄█▒▒▒█ █▒▒▒█ █▒▒▒█ █▒▒▒███▒▒▒█ █▒▒▒▒▒▒▒▒▒█ █▒▒▒█      
█▓▓▓█▀▀▀    █▓▓▓▓▓▓▓▓▓█ █▓▓▓█ █▓▓▓█ █▓▓▓▓▓▓▓▓▓█ █▓▓▓█▀█▓▓▓█ █▓▓▓█      
█████       ███████████ █████ █████ ███████████ █████ █████ █████      
▀▀▀▀▀       ▀▀▀▀▀▀▀▀▀▀▀  ▀▀▀▀ ▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀ ▀▀▀▀▀ ▀▀▀▀▀
`
  .replace(/^\n/, '')
  .replace(/\n$/, '')
  .split('\n')
  .map((line) => line.replace(/\s+$/, ''));

const ART_COMPACT = [
  ['███', '█  ', '█  '],
  ['█ █', ' █ ', ' █ '],
  ['█ █', '███', '█ █'],
  ['███', '██ ', '███'],
  ['█ █', ' █ ', '█ █'],
  ['███', ' █ ', ' █ ']
].reduce((lines, glyphRows, glyphIndex) => {
  glyphRows.forEach((row, rowIndex) => {
    lines[rowIndex] += `${glyphIndex ? ' ' : ''}${row}`;
  });
  return lines;
}, ['', '', '']);
function widthOf(lines) {
  return lines.reduce((max, line) => Math.max(max, Array.from(line).length), 0);
}

const ART_WIDE_WIDTH = widthOf(ART_WIDE);
const ART_COMPACT_WIDTH = widthOf(ART_COMPACT);
for (let row = 0; row < ART_COMPACT.length; row += 1) {
  ART_COMPACT[row] = ART_COMPACT[row].padEnd(ART_COMPACT_WIDTH);
}

module.exports = {
  ART_WIDE,
  ART_COMPACT,
  ART_WIDE_WIDTH,
  ART_COMPACT_WIDTH
};
