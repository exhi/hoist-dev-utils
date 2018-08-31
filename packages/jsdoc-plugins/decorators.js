exports.handlers = {

    beforeParse: function(e) {
        const subs = [
            [/@HoistModel\(\)\n/gm, ''],
            [/@HoistService\(\)\n/gm, ''],
            [/@observable\n/gm, ''],
            [/@observable /gm, ''],
            [/^ *@action\n/gm, '']
        ];

        subs.forEach(it => {
            e.source = e.source.replace(it[0], it[1]);
        });

        console.log(e.source);
    }

};