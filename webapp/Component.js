sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/winslow/ocr/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("sap.winslow.ocr.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            this.getModel().attachRequestFailed((oEvent) => {
                if (oEvent.getParameter("response").statusCode === 401) {
                    if (!that.isMBActive) {
                        that.isMBActive = true;
                        sap.m.MessageBox.information("Your session has been expired. Please log in again to continue", {
                            title: "Session Expired",
                            onClose: function () {
                                that.isMBActive = false;
                                window.location.reload();
                            }
                        });
                    }
                }
            });
            this._startSessionCheck();
        },

        _startSessionCheck: function () {
            const that = this;
            this._sessionCheckInterval = setInterval(() => {
                this.getModel().read("/UserMapping", {
                    success: () => {
                        // Session alive
                    },
                    error: (oError) => {
                        if (oError.statusCode === 401) {
                            if (!that.isMBActive) {
                                that.isMBActive = true;
                                sap.m.MessageBox.information("Your session has been expired. Please log in again to continue", {
                                    title: "Session Expired",
                                    onClose: function () {
                                        that.isMBActive = false;
                                        window.location.reload();
                                    }
                                });
                            }
                        }
                    }
                });
            }, 60 * 1000); // 60 sec
        }
    });
});