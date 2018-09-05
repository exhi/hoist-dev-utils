const classesByFile = {};
const ptRanges = {};

exports.handlers = {

    beforeParse: function(e) {
        const subs = [
            [/@HoistModel\n/gm, ''],
            [/@HoistService\n/gm, ''],
            [/@HoistComponent\n/gm, ''],
            [/@HotkeysTarget\n/gm, ''],
            [/@LayoutSupport\n/gm, ''],
            [/@computed\n/gm, ''],
            [/@observable\n/gm, ''],
            [/@observable /gm, ''],
            [/@observable.ref /gm, ''],
            [/@observable.shallow /gm, ''],
            [/^ *@action\n/gm, '']
        ];

        // Strip decorators entirely (for now).
        subs.forEach(it => {
            e.source = e.source.replace(it[0], it[1]);
        });
    },

    symbolFound: function(e) {
        const f = e.filename;

        // Associate file with Class
        // TODO - problematic if we declare multiple classes within a file - needs to be more targeted.
        if (e.code.node.type == 'ClassDeclaration') {
            if (classesByFile[f]) {
                console.warn(`File already associated with class: ${f} | ${classesByFile[f]}`);
            } else {
                classesByFile[f] = e.code.node.id.name;
                // console.log(`${f} -> ${e.code.node.id.name}`);
            }
        }

        // Bookmark range of any propType declarations
        if (e.code.name == 'propTypes') {
            ptRanges[e.filename] = {
                start: e.range[0],
                end: e.range[1]
            };
        }
    },

    // For each doclet that is to be documented, determine if the symbol falls within a known
    // proptypes range for the class and if so force proptypes to appear as instance members.
    newDoclet: function(e) {
        const {doclet} = e,
            {meta} = doclet,
            filename = `${meta.path}/${meta.filename}`,
            fileClass = classesByFile[filename],
            ptRange = ptRanges[filename];

        if (fileClass && ptRange && !doclet.undocumented) {
            const dlStart = doclet.meta.range[0],
                inPropTypes = dlStart >= ptRange.start && dlStart <= ptRange.end;

            if (inPropTypes) {
                doclet.scope = 'instance';
                doclet.longname = `${fileClass}#${doclet.name}`;
                doclet.memberof = fileClass;
            }
        }
    },

    parseComplete: function() {
        // console.log(ptRanges);
    }

};