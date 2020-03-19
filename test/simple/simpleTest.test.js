
const transformer      = require('../../lib/index');
const path             = require('path');
const expectedObject   = require('./expectedObject');

const options= {
    dest: path.join(__dirname, './output'),
    src: path.join(__dirname, './input'),
    template: path.join(__dirname, '../template/'),

    debug: false,
    silent: false,
    verbose: false,
    simulate: false,
    parse: false, // only parse and return the data, no file creation
    colorize: true,
    markdown: true
};
test('simple file should be transformed correctly', () => {
    var transformedObj = transformer.createApidocSwagger(options);
    expect(JSON.parse(transformedObj.swaggerData)).toEqual(expectedObject);
});