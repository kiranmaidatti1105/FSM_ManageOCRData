sap.ui.define([
    "sap/ui/core/format/DateFormat"
], function (DateFormat) {
    "use strict";
    return {
        formatDate: function (sDate) {

            if (sDate) {
                var oDateFormat = DateFormat.getDateInstance({ pattern: 'dd/MM/yyyy HH:mm:ss' });
                return oDateFormat.format(new Date(sDate));
            }
            return sDate;
        },
        formatDocketDate: function (sDate) {

            if (sDate) {
                var oDateFormat = DateFormat.getDateInstance({ pattern: 'dd/MM/yyyy' });
                return oDateFormat.format(new Date(sDate));
            }
            return sDate;
        },

        formatObjectStatus: function (sStatus) {
            switch (sStatus) {
                case "Saved":
                    return "Information";
                case "Processed":
                    return "Success";
                case "In Process":
                    return "Warning";
            }
        },

        formatDivisionDisplay: function (sDivision) {
            if (!sDivision) return "";

            const map = {
                "23": "NDD",
                "25": "Spotters",
                "26": "Line Marking",
                "24": "Signage & Install",
                "22": "Saw & Core",
                "21": "Traffic Design",
                "27": "Stock",
                "29": "Traffic Control"
            };

            const sService = map[sDivision];

            if (sService) return `${sService} (${sDivision})`;
            
            return sDivision; // fallback
        }

    }
});