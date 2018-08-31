exports.handlers = {

    beforeParse: function(e) {
        const subs = [
            [/@HoistModel\(\)\n/gm, ''],
            [/@HoistService\(\)\n/gm, ''],
            [/@HoistComponent\(\)\n/gm, ''],
            [/@LayoutSupport\n/gm, ''],
            [/@computed\n/gm, ''],
            [/@observable\n/gm, ''],
            [/@observable /gm, ''],
            [/@observable.ref /gm, ''],
            [/@observable.shallow /gm, ''],
            [/^ *@action\n/gm, '']
        ];

        subs.forEach(it => {
            e.source = e.source.replace(it[0], it[1]);
        });

        // console.log(e.source);
    }

};