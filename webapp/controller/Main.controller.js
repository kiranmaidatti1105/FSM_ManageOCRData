
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/formatter",
    'sap/m/library',
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    'sap/ui/export/Spreadsheet',
], (Controller, JSONModel, Formatter, mobileLibrary, MessageBox, MessageToast, BusyIndicator, Filter, FilterOperator, Spreadsheet) => {
    "use strict";

    var URLHelper = mobileLibrary.URLHelper;

    return Controller.extend("sap.winslow.ocr.controller.Main", {
        Formatter: Formatter,

        onInit: async function () {
            const isLoggingOut = sessionStorage.getItem("userIsLoggingOut");
            if (isLoggingOut === "true") {
                sessionStorage.removeItem("userIsLoggingOut");
                window.location.reload();
                return;
            }
            const isDOCRVerifier = await this.getUserRole();
            // const isDOCRVerifier = true;
            if (isDOCRVerifier) {
                this.byId("fcl").setVisible(true);
            }
            else {
                MessageBox.error("Your role doesn't have access to Trafman OCR Verification Application. Please Contact to System Administrator.", {
                    title: "Access Denied"
                });
                this.byId("fcl").setVisible(false);
                return; // exit early, nothing else will run
            }

            var oMultiComboBox = this.byId("IA_ID_Division");

            oMultiComboBox.setFilterFunction(function (sTerm, oItem) {
                return oItem.getText().toLowerCase().includes(sTerm.toLowerCase());
            });

            var oDate = new Date();
            oDate.setHours(0, 0, 0, 0);

            var oViewModel = new JSONModel({
                editMode: false,
                Mode: false,
                inputMode: false,
                SCFMode: false,
                SESMode: false,
                today: oDate,
                SupplierDetail: false
            });
            this.getView().setModel(oViewModel, "viewModel");
            this.i18nModel = this.getOwnerComponent().getModel("i18n").getResourceBundle();

            await this.getDivision();
            this.Datarefresh();
            // this.IA_onSearch()

            this._ViewDatePickersReadOnly(["DocketDate"], this.getView());

            var oJSONModel = new sap.ui.model.json.JSONModel();
            this.getView().setModel(oJSONModel, "POHeaderModel");
        },
        onItemNoLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue();
            sValue = sValue.replace(/[^0-9.]/g, "");
            var aParts = sValue.split(".");
            if (aParts.length > 2) {
                sValue = aParts[0] + "." + aParts.slice(1).join("");
                aParts = sValue.split(".");
            }
            if (aParts[0].length > 5) {
                aParts[0] = aParts[0].substring(0, 5);
            }
            if (aParts[1] && aParts[1].length > 2) {
                aParts[1] = aParts[1].substring(0, 2);
            }
            sValue = aParts.length === 2 ? aParts[0] + "." + aParts[1] : aParts[0];
            oInput.setValue(sValue);
        },
        getDivision: function () {
            var oModel = this.getOwnerComponent().getModel()
            oModel.read("/CompanyCodeData", {
                urlParameters: {
                    "$select": "Division",
                    "$filter": "Division ne '' and CompanyCode eq 'C006'"
                },
                success: function (oData) {
                    var Divisionmodel = new JSONModel(oData.results);
                    this.getView().setModel(Divisionmodel, "CompanyCodeDivision");

                    this.getView().getModel("CompanyModel")?.updateBindings(true);
                }.bind(this),
                error: function (oError) {
                    MessageBox.error("Error fetching Division Data", {
                        details: oError
                    });
                }
            });

        },
        getUserRole: function () {
            return new Promise(async (resolve) => {
                try {
                    const response = await fetch("/user-api/currentUser", {
                        method: "GET",
                        credentials: "include"
                    });
                    if (!response.ok) {
                        throw new Error("Failed to fetch user info");
                    }
                    const userInfo = await response.json();
                    const hasRole = userInfo.scopes.some(role => role.includes("DOCRVerifier"));
                    resolve(hasRole);
                } catch (err) {
                    MessageBox.error("Error fetching user info", {
                        details: err
                    });
                    resolve(false);
                }
            });
        },

        _ViewDatePickersReadOnly: function (aIds, oView) {
            aIds.forEach(function (sId) {
                var oDatePicker = oView.byId(sId);
                if (oDatePicker) {
                    oDatePicker.addEventDelegate({
                        onAfterRendering: function () {
                            var oInputDom = oDatePicker.getDomRef("inner");
                            if (oInputDom) {
                                oInputDom.setAttribute("readonly", true);
                                oInputDom.style.cursor = "pointer";
                            }
                        }
                    }, oDatePicker);
                    // Open calendar on click
                    oDatePicker.attachBrowserEvent("click", function () {
                        var oIconDomRef = oDatePicker.getDomRef("icon");
                        if (oIconDomRef) {
                            oIconDomRef.click();
                        }
                    });
                }
            });
        },
        Datarefresh: function () {
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oCompanyModel = this.getView().getModel("CompanyModel")
            var sSelectedCompanyID = oCompanyModel?.getProperty("/SelectedCompany/DocAIID");

            oModel.read("/DocketsOCR", {
                urlParameters: {
                    "$expand": "Items($orderby=ItemNo asc,ItemID  asc)",
                    "$orderby": "modifiedAt desc"
                },
                success: (data) => {
                    that.getPurchaseOrderData(data.results[0]?.PurchaseOrder);
                    that.getServiceOrderItemData(data.results[0]?.ServiceOrder, data.results[0]?.ServiceOrderItem)
                    var model = new JSONModel(data.results);
                    this.getView().setModel(model, "CompanyModel");
                    var oCompanyModel = this.getView().getModel("CompanyModel");
                    var viewModel = this.getView().getModel("viewModel")
                    const oFCL = this.getView().byId("fcl");
                    const oButton = this.byId("StartExpandBtn");
                    if (data.results.length === 0) {
                        oFCL.setLayout("OneColumn");
                        oButton.setIcon("sap-icon://exit-full-screen");
                    } else {
                        oFCL.setLayout("TwoColumnsMidExpanded");
                        oButton.setIcon("sap-icon://full-screen");
                    }
                    data.results.forEach((item) => {
                        if (item.DocketDate) {
                            const date = new Date(item.DocketDate);
                            item.DocketDate = date.toISOString();
                        }
                    });

                    // let selectedCompany;

                    // if (!sSelectedCompanyID) {
                    var selectedCompany = data.results[0];
                    if (data.results[0].Status === "Processed" || data.results[0].Status === "In Process") {
                        viewModel.setProperty("/editMode", true);
                        viewModel.setProperty("/inputMode", false);
                        that.getView().byId("MOD_id_EditBtn").setVisible(false);
                    }
                    else {
                        viewModel.setProperty("/editMode", false);
                        viewModel.setProperty("/Mode", false);
                        viewModel.setProperty("/inputMode", false);
                    }
                    var bHasSCF = !!data.results[0].ServiceConfirmation;
                    var bHasSES = !!data.results[0].ServiceEntrySheet;

                    viewModel.setProperty("/SCFMode", bHasSCF);
                    viewModel.setProperty("/SESMode", bHasSES);
                    // } 
                    // else {
                    //     selectedCompany = data.results.find(c => c.DocAIID === sSelectedCompanyID) || data.results[0];

                    // }

                    // if (selectedCompany) {
                    oCompanyModel.setProperty("/SelectedCompany", selectedCompany);

                    // }

                    // this.onBeforeRebindTable()

                    this.IA_onPressClear()
                    this.IA_onSearch()

                },
                error: (oError) => {
                    MessageBox.error("READ Failed", {
                        details: oError
                    })
                }
            });
        },


        onViewAttachment: function (oEvent) {
            var sUrl = oEvent.getSource().getBindingContext("CompanyModel").getObject();
            URLHelper.redirect(sUrl.AttachmentLink, true);
        },

        onItemPress: function (oEvent) {
            var oFCL = this.byId("fcl");
            var oButton = this.byId("StartExpandBtn");
            var oLayout = this.byId("ObjectPageLayout");
            var oSelectedSection = this.byId("CompanyObjectPageSection");
            oLayout.setSelectedSection(oSelectedSection);

            var oRowContext = oEvent.getSource().getBindingContext() || oEvent.getSource().getBindingContext("CompanyModel");

            if (!oRowContext) {
                MessageToast.show("Row context not found");
                return;
            }

            var oData = oRowContext.getObject();
            var oCompanyModel = this.getView().getModel("CompanyModel");

            oCompanyModel.setProperty("/SelectedCompany", oData);

            var sDocAAID = oData.DocAIID;
            var oModel = this.getView().getModel();

            if (sDocAAID) {
                BusyIndicator.show(0);
                oModel.read("/DocketsOCR('" + sDocAAID + "')", {
                    urlParameters: {
                        "$expand": "Items($orderby=ItemNo asc,ItemID  asc)",
                    },
                    success: function (oResponse) {
                        BusyIndicator.hide();
                        oCompanyModel.setProperty("/SelectedCompany", oResponse);
                        this.getPurchaseOrderData(oResponse?.PurchaseOrder);
                        this.getServiceOrderItemData(oResponse?.ServiceOrder, oResponse?.ServiceOrderItem)

                    }.bind(this),
                    error: function (oError) {
                        BusyIndicator.hide();
                        MessageBox.error("Read failed:", {
                            details: oError
                        });
                    }
                });
            } else {
                MessageToast.show("DOCAAID not found in selected row");
            }

            var oViewModel = this.getView().getModel("viewModel");

            if (oData.Status === "Processed" || oData.Status === "In Process") {
                oViewModel.setProperty("/editMode", true);
                oViewModel.setProperty("/inputMode", false);
                oViewModel.setProperty("/Mode", false);


            } else {
                oViewModel.setProperty("/editMode", false);
                oViewModel.setProperty("/inputMode", false);
                oViewModel.setProperty("/Mode", false);

            }
            var bHasSCF = !!oData.ServiceConfirmation;
            var bHasSES = !!oData.ServiceEntrySheet;

            oViewModel.setProperty("/SCFMode", bHasSCF);
            oViewModel.setProperty("/SESMode", bHasSES);
            oFCL.setLayout("TwoColumnsMidExpanded");
            oButton.setIcon("sap-icon://full-screen");
        },
        onSave: function () {
            var viewModel = this.getView().getModel("viewModel");
            var oModel = this.getOwnerComponent().getModel();
            var oViewModel = this.getView().getModel("CompanyModel");
            var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");
            var that = this;

            var date = oSelectedCompany.DocketDate
                ? Formatter.formatDocketDate(oSelectedCompany.DocketDate).split('/').reverse().join('-')
                : null;

            oSelectedCompany.DocketDate = date;
            oSelectedCompany.Status = "Saved";

            this._convertItemDateTimes(oSelectedCompany.Items.results);
            oSelectedCompany.Items.results.forEach((item) => {
                if (!item.Quantity) {
                    item.Quantity = ""
                }
            })
            MessageBox.confirm("Are you sure you want update the Docket?", {
                title: "Update Confirmation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        oModel.update("/DocketsOCR('" + oSelectedCompany.DocAIID + "')", oSelectedCompany, {
                            success: function () {
                                MessageToast.show(that.i18nModel.getText("Saved"));
                                oViewModel.setProperty("/Status", "Saved");
                                // var aItems = oSelectedCompany.Items.results || [];

                                // aItems.sort(function (a, b) {
                                //     return a.ItemNo - b.ItemNo || a.ProductId - b - ProductId;
                                // });

                                // oViewModel.setProperty("/SelectedCompany/Items/results", aItems);

                                // var oTable = that.getView().byId("idItemTable");
                                // if (oTable) {
                                //     oTable.getBinding("items").refresh();
                                // }

                                that.IA_onSearch()
                            },
                            error: function (err) {
                                MessageBox.error("Error updating header", {
                                    details: err
                                });
                            }
                        });

                    } else if (oAction === MessageBox.Action.CANCEL) {
                        viewModel.setProperty("/inputMode", true);
                        viewModel.setProperty("/editMode", true);
                        viewModel.setProperty("/Mode", true);
                        viewModel.setProperty("/SCFMode", true);
                        viewModel.setProperty("/SESMode", true);

                    } else {
                        viewModel.setProperty("/editMode", false);
                        viewModel.setProperty("/inputMode", false);
                        viewModel.setProperty("/Mode", false);
                        var bHasSCF = !!oSelectedCompany.ServiceConfirmation;
                        var bHasSES = !!oSelectedCompany.ServiceEntrySheet;

                        viewModel.setProperty("/SCFMode", bHasSCF);
                        viewModel.setProperty("/SESMode", bHasSES);
                    }
                }
            });




        },

        Mandatoryfields: function () {
            var oViewModel = this.getView().getModel("CompanyModel");
            var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

            var missingHeaderFields = [];
            if (!oSelectedCompany.DocketDate) missingHeaderFields.push("Docket Date");
            if (!oSelectedCompany.Division) missingHeaderFields.push("Division");
            if (!oSelectedCompany.ServiceOrderItem) missingHeaderFields.push("Item No");
            if (!oSelectedCompany.Items.results.length) missingHeaderFields.push("Items");

            if (missingHeaderFields.length > 0) {
                MessageBox.error(
                    "Please fill in all mandatory fields before processing.", {
                    details: "Invalid data:\n" + missingHeaderFields.join(" ,\n")
                }
                );
                return false;
            }

            var isValid = oSelectedCompany.Items.results.every(function (item, index) {
                var missingItemFields = [];
                if (!item.ItemID) missingItemFields.push("Product ID");
                if (!item.POItem || Number(item.POItem) === 0) missingItemFields.push("PO Item");

                if (!item.Quantity || Number(item.Quantity) === 0) missingItemFields.push("Quantity");
                if (!item.StartDateTime) missingItemFields.push("StartDateTime");
                if (!item.EndDateTime) missingItemFields.push("EndDateTime");
                if (!item.Description) missingItemFields.push("Description");
                if (!item.ItemNo || Number(item.ItemNo) === 0) missingItemFields.push("SO ItemNo");

                if (missingItemFields.length > 0) {
                    MessageBox.error(
                        "Please fill in all mandatory fields in row " + (index + 1) + " before proceeding", {
                        details: "Invalid fields:\n" + missingItemFields.join(" ,\n")
                    }
                    );
                    return false;
                }
                if (item.StartDateTime && item.EndDateTime) {
                    var start = new Date(item.StartDateTime);
                    var end = new Date(item.EndDateTime);
                    var diffMs = end - start;
                    var diffMinutes = diffMs / (1000 * 60);   // ms → minutes
                    var diffHours = diffMs / (1000 * 60 * 60); // ms → hours

                    if (diffMinutes < 1) {
                        MessageBox.error("End DateTime must be at least 1 minute greater than Start DateTime.", {
                            details: "Refer row " + (index + 1) + "."
                        });
                        return false;
                    }
                    else if (diffHours > 24) {
                        MessageBox.error("End DateTime must be within 24 hours of Start DateTime.", {
                            details: "Refer row " + (index + 1) + ", Duration exceeds by " + diffHours.toFixed(2) + " hrs."
                        });
                        return false;
                    }
                }
                if (parseFloat(item.Quantity) <= parseFloat(item.BreakTimeQty)) {
                    MessageBox.error("Break-Time Qty should be lesser than the Product Quantity.", {
                        details: "Refer row " + (index + 1) + "."
                    });
                    return false;
                }
                if (parseFloat(item.InclWeatherQty) > (parseFloat(item.Quantity) - parseFloat(item.BreakTimeQty))) {
                    MessageBox.error("Incl. Weather Qty shouldn't be more than the Actual Quantity (Qty minus Break-Time).", {
                        details: "Refer row " + (index + 1) + "."
                    });
                    return false;
                }
                return true;

            });

            if (!isValid) return false;

            return true;
        },
        _convertItemDateTimes: function (items) {
            items.forEach((item) => {
                // --- Convert StartDateTime ---
                if (item.StartDateTime) {
                    const start = new Date(item.StartDateTime);
                    if (!isNaN(start)) {
                        const pad = (n) => n.toString().padStart(2, '0');
                        item.StartDateTime =
                            `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`;
                    }


                    else {
                        // handle custom format like "2025 00:37:46-01-24"
                        const match = item.StartDateTime.match(/(\d{4}) (\d{2}):(\d{2}):(\d{2})-(\d{2})-(\d{2})/);
                        if (match) {
                            const [_, year, hour, minute, second, month, day] = match;
                            item.StartDateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
                        } else {
                            item.StartDateTime = null;
                        }
                    }
                } else {
                    item.StartDateTime = null;
                }

                // --- Convert EndDateTime ---
                if (item.EndDateTime) {
                    const start = new Date(item.EndDateTime);
                    if (!isNaN(start)) {
                        const pad = (n) => n.toString().padStart(2, '0');
                        item.EndDateTime =
                            `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`;
                    }
                    else {
                        const match = item.EndDateTime.match(/(\d{4}) (\d{2}):(\d{2}):(\d{2})-(\d{2})-(\d{2})/);
                        if (match) {
                            const [_, year, hour, minute, second, month, day] = match;
                            item.EndDateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
                        } else {
                            item.EndDateTime = null;
                        }
                    }
                } else {
                    item.EndDateTime = null;
                }
            });
        },
        // onProcess: async function () {
        //     var that = this;
        //     var viewModel = this.getView().getModel("viewModel");
        //     var oModel = this.getOwnerComponent().getModel();
        //     var oViewModel = this.getView().getModel("CompanyModel");

        //     var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

        //     var isValid = await this.Mandatoryfields();
        //     if (!isValid) {
        //         return;
        //     }
        //     oSelectedCompany.DocketDate = oSelectedCompany.DocketDate
        //         ? Formatter.formatDocketDate(oSelectedCompany.DocketDate).split('/').reverse().join('-')
        //         : null;;

        //     this._convertItemDateTimes(oSelectedCompany.Items.results);

        //     var sGroup = "processBatch";
        //     oModel.setUseBatch(true);
        //     oModel.setDeferredGroups([sGroup]);



        //     var ServiceModel = new JSONModel({
        //         ServiceConfirmationType: "SVC1",
        //         Division: oSelectedCompany.Division,
        //         ReferenceServiceOrder: oSelectedCompany.ServiceOrder,


        //         to_Item: { "results": [] }
        //     });

        //     var DocketItem = oSelectedCompany.Items.results;
        //     DocketItem.map(function (item) {

        //         ServiceModel.getProperty("/to_Item/results").push({
        //             ServiceConfItemDescription: item.Description ? item.Description.length > 40 ? item.Description.substring(0, 40) : item.Description : "",

        //             Product: item.ItemID,
        //             Quantity: item.Quantity,
        //             ReferenceServiceOrder: oSelectedCompany.ServiceOrder,
        //             ReferenceServiceOrderItem: oSelectedCompany.ServiceOrderItem.includes(",") ? oSelectedCompany.ServiceOrderItem.split(",")[0] : oSelectedCompany.ServiceOrderItem,
        //             RefSrvcOrdItemIsUnplanned: false,
        //             ActualServiceStartDateTime: item.StartDateTime,
        //             ActualServiceEndDateTime: item.EndDateTime,
        //             SrvcConfItmCndnRateCurrency: "AUD"
        //         });
        //     });

        //     this.getView().setModel(ServiceModel, "ServiceModel");
        //     var oServiceConfirm = this.getView().getModel("ServiceModel").getData();


        //     var ServiceSheetModel = new JSONModel({
        //         PurchaseOrder: "4500000519",
        //         ServiceEntrySheetName: "SES071",
        //         to_ServiceEntrySheetItem: { "results": [] }
        //     });

        //     var DocketItem = oSelectedCompany.Items.results;
        //     DocketItem.map(function (item) {

        //         ServiceSheetModel.getProperty("/to_ServiceEntrySheetItem/results").push({
        //             ServiceEntrySheetItem: DocketItem.length.toString(),
        //             ConfirmedQuantity: item.Quantity,
        //             PurchaseOrder: "4500000519",
        //             PurchaseOrderItem: "10",
        //             ServiceEntrySheetItemDesc: item.Description ? item.Description.length > 40 ? item.Description.substring(0, 40) : item.Description : "",
        //             ServicePerformanceDate: item.StartDateTime.split('T')[0],
        //             ServicePerformanceEndDate: item.EndDateTime.split('T')[0]
        //         });
        //     });
        //     this.getView().setModel(ServiceSheetModel, "ServiceSheetModel");
        //     var ServiceSheetModel = this.getView().getModel("ServiceSheetModel").getData();

        //     oModel.create("/A_ServiceEntrySheet", ServiceSheetModel, {
        //         groupId: sGroup
        //     });

        //     oModel.create("/A_ServiceConfirmation", oServiceConfirm, {
        //         groupId: sGroup
        //     });

        //     //  Confirm + submitChanges
        //     MessageBox.confirm("Are you sure you want to Process this Details?", {
        //         title: "Process Confirmation",
        //         onClose: function (oAction) {
        //             if (oAction === MessageBox.Action.OK) {
        //                 oSelectedCompany.Status = "Processed";
        //                 oModel.submitChanges({
        //                     groupId: sGroup,
        //                     success: function (oResponse) {
        //                         var batchResponse = oResponse.__batchResponses && oResponse.__batchResponses[0];

        //                         if (batchResponse.response && batchResponse.response.statusCode === "500") {
        //                             MessageBox.error(JSON.parse(JSON.parse(batchResponse.response.body).error.message.value).reason.response.body.error.innererror.errordetails[0].message);

        //                             return;
        //                         }
        //                         viewModel.setProperty("/editMode", true);

        //                         MessageToast.show(that.i18nModel.getText("Processed"));
        //                         var ServiceEntrySheetNo = oResponse.__batchResponses?.[0]?.__changeResponses[0].data.ServiceEntrySheet;
        //                         var ServiceConfirmationNo = oResponse.__batchResponses?.[0]?.__changeResponses[0].data.ServiceConfirmation;

        //                         oSelectedCompany.ServiceEntrySheet = ServiceEntrySheetNo
        //                         oSelectedCompany.ServiceConfirmation = ServiceConfirmationNo


        //                         oModel.update("/DocketsOCR('" + oSelectedCompany.DocAIID + "')", oSelectedCompany, {
        //                             success: function () {
        //                                 console.log("Sucess");
        //                                 oViewModel.refresh(true);
        //                             },
        //                             error: function (oError) {
        //                                 console.error("Batch Error", oError);

        //                             }
        //                         });
        //                     },
        //                     error: function (oError) {
        //                         console.error("Batch Error", oError);
        //                     }
        //                 });
        //             }
        //         }
        //     });
        // },

        // onProcess: async function () {
        //     var that = this;
        //     var viewModel = this.getView().getModel("viewModel");
        //     var oModel = this.getOwnerComponent().getModel();
        //     var oViewModel = this.getView().getModel("CompanyModel");
        //     var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

        //     var isValid = await this.Mandatoryfields();
        //     if (!isValid) return;

        //     oSelectedCompany.DocketDate = oSelectedCompany.DocketDate
        //         ? Formatter.formatDocketDate(oSelectedCompany.DocketDate).split('/').reverse().join('-')
        //         : null;

        //     this._convertItemDateTimes(oSelectedCompany.Items.results);

        //     var ServiceModel = new JSONModel({
        //         ServiceConfirmationType: "SVC1",
        //         Division: oSelectedCompany.Division,
        //         ReferenceServiceOrder: oSelectedCompany.ServiceOrder,
        //         to_Item: { results: [] }
        //     });

        //     oSelectedCompany.Items.results.forEach(function (item) {
        //         ServiceModel.getProperty("/to_Item/results").push({
        //             ServiceConfItemDescription: item.Description
        //                 ? item.Description.length > 40
        //                     ? item.Description.substring(0, 40)
        //                     : item.Description
        //                 : "",
        //             Product: item.ItemID,
        //             Quantity: item.Quantity,
        //             ReferenceServiceOrder: oSelectedCompany.ServiceOrder,
        //             ReferenceServiceOrderItem: oSelectedCompany.ServiceOrderItem.includes(",")
        //                 ? oSelectedCompany.ServiceOrderItem.split(",")[0]
        //                 : oSelectedCompany.ServiceOrderItem,
        //             RefSrvcOrdItemIsUnplanned: false,
        //             ActualServiceStartDateTime: item.StartDateTime,
        //             ActualServiceEndDateTime: item.EndDateTime,
        //             SrvcConfItmCndnRateCurrency: "AUD"
        //         });
        //     });
        //     var oServiceConfirm = ServiceModel.getData();

        //     var ServiceSheetModel = new JSONModel({
        //         PurchaseOrder: "4500000519",
        //         ServiceEntrySheetName: "SES071",
        //         to_ServiceEntrySheetItem: { results: [] }
        //     });

        //     oSelectedCompany.Items.results.forEach(function (item, index) {
        //         ServiceSheetModel.getProperty("/to_ServiceEntrySheetItem/results").push({
        //             ServiceEntrySheetItem: (index + 1).toString(),
        //             ConfirmedQuantity: item.Quantity,
        //             PurchaseOrder: "4500000519",
        //             PurchaseOrderItem: "10",
        //             ServiceEntrySheetItemDesc: item.Description
        //                 ? item.Description.length > 40
        //                     ? item.Description.substring(0, 40)
        //                     : item.Description
        //                 : "",
        //             ServicePerformanceDate: item.StartDateTime.split('T')[0],
        //             ServicePerformanceEndDate: item.EndDateTime.split('T')[0]
        //         });
        //     });
        //     var oServiceSheet = ServiceSheetModel.getData();

        //     MessageBox.confirm("Are you sure you want to Process this Details?", {
        //         title: "Process Confirmation",
        //         onClose: async function (oAction) {
        //             if (oAction !== MessageBox.Action.OK) return;

        //             BusyIndicator.show(0);

        //             var scSuccess = false, sesSuccess = false, docketSuccess = false;

        //             try {
        //                 let oSCResponse = await new Promise((resolve, reject) => {
        //                     oModel.create("/A_ServiceConfirmation", oServiceConfirm, {
        //                         success: resolve,
        //                         error: reject
        //                     });
        //                 });
        //                 oSelectedCompany.ServiceConfirmation = oSCResponse.ServiceConfirmation;
        //                 scSuccess = true;
        //             } catch (err) {
        //                 console.error("Service Confirmation failed", err);
        //                 MessageBox.error(JSON.parse(JSON.parse(err.responseText).error.innererror.errordetails[0].message.value).reason.response.body.error.innererror.errordetails[0].message)
        //             }

        //             try {
        //                 let oSESResponse = await new Promise((resolve, reject) => {
        //                     oModel.create("/A_ServiceEntrySheet", oServiceSheet, {
        //                         success: resolve,
        //                         error: reject
        //                     });
        //                 });
        //                 oSelectedCompany.ServiceEntrySheet = oSESResponse.ServiceEntrySheet;
        //                 sesSuccess = true;
        //             } catch (err) {
        //                 MessageBox.error(JSON.parse(JSON.parse(err.responseText).error.innererror.errordetails[0].message.value).reason.response.body.error.innererror.errordetails[0].message)
        //             }

        //             oSelectedCompany.Status = "Processed";
        //             try {
        //                 await new Promise((resolve, reject) => {
        //                     oModel.update("/DocketsOCR('" + oSelectedCompany.DocAIID + "')", oSelectedCompany, {
        //                         success: resolve,
        //                         error: reject
        //                     });
        //                 });
        //                 viewModel.setProperty("/editMode", true);
        //                 docketSuccess = true;
        //             } catch (err) {
        //                 console.error("Docket update failed", err);
        //             }

        //             BusyIndicator.hide();

        //             if (scSuccess && sesSuccess && docketSuccess) {
        //                 MessageToast.show("All steps processed successfully!");
        //             } else {
        //                 // MessageBox.warning("Processing completed with some errors.");
        //             }

        //             oViewModel.refresh(true);
        //         }
        //     });
        // },
        SCFProcess: async function () {
            var that = this;
            var viewModel = this.getView().getModel("viewModel");
            var oModel = this.getOwnerComponent().getModel();
            var oViewModel = this.getView().getModel("CompanyModel");
            var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

            var isValid = await this.Mandatoryfields();
            if (!isValid) return;

            oSelectedCompany.DocketDate = oSelectedCompany.DocketDate
                ? Formatter.formatDocketDate(oSelectedCompany.DocketDate).split('/').reverse().join('-')
                : null;

            var scItems = JSON.parse(JSON.stringify(that.getView().getModel("SCItemsModel").getProperty("/results")));
            this._convertItemDateTimes(scItems);
            var ServiceModel = new JSONModel({
                ServiceConfirmationType: "SVC1",
                Division: oSelectedCompany.Division,
                ReferenceServiceOrder: oSelectedCompany.ServiceOrder,
                ServiceConfirmationIsCompleted: "X",
                to_Item: { results: [] }
            });

            scItems.forEach(function (item) {
                ServiceModel.getProperty("/to_Item/results").push({
                    ServiceConfItemDescription: "",
                    Product: item.ItemID,
                    Quantity: item.Quantity,
                    ReferenceServiceOrder: oSelectedCompany.ServiceOrder,
                    ReferenceServiceOrderItem: (item.UnPlanned === false)
                        ? oSelectedCompany.ServiceOrderItem.split(",")[0]
                        : item.ItemNo,
                    RefSrvcOrdItemIsUnplanned: item.UnPlanned,
                    ActualServiceStartDateTime: item.StartDateTime,
                    ActualServiceEndDateTime: item.EndDateTime,
                    SrvcConfItmCndnRateCurrency: "AUD",
                    ExecutingServiceEmployee: oSelectedCompany.ExecServiceEmployee,
                    ActualServiceDuration: 1,
                    ActualServiceDurationUnit: "MIN"
                });
            });
            var oServiceConfirm = ServiceModel.getData();

            MessageBox.confirm("Are you sure you want to Process this Details?", {
                title: "Process Confirmation",
                onClose: async function (oAction) {
                    if (oAction !== MessageBox.Action.OK) return;

                    BusyIndicator.show(0);
                    try {
                        let oSCResponse = await new Promise((resolve, reject) => {
                            oModel.create("/A_ServiceConfirmation", oServiceConfirm, {
                                success: resolve,
                                error: reject
                            });
                        });
                        oSelectedCompany.ServiceConfirmation = oSCResponse.ServiceConfirmation;
                        await that._updateDocketStatus(oSelectedCompany);
                        viewModel.setProperty("/SCFMode", true);
                        that.getView().byId("MOD_id_EditBtn").setVisible(false);
                        BusyIndicator.hide();
                    } catch (err) {
                        BusyIndicator.hide();
                        MessageBox.error(JSON.parse(JSON.parse(err.responseText).error.innererror.errordetails[0].message.value).reason.response.body.error.innererror.errordetails[0].message)
                    }
                }
            })

        },

        SESProcess: async function () {
            var that = this;
            var viewModel = this.getView().getModel("viewModel");
            var oModel = this.getOwnerComponent().getModel();
            var oViewModel = this.getView().getModel("CompanyModel");
            var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

            var isValid = await this.Mandatoryfields();
            if (!isValid) return;

            oSelectedCompany.DocketDate = oSelectedCompany.DocketDate
                ? Formatter.formatDocketDate(oSelectedCompany.DocketDate).split('/').reverse().join('-')
                : null;

            var sesItems = JSON.parse(JSON.stringify(that.getView().getModel("SESItemsModel").getProperty("/results")));
            this._convertItemDateTimes(sesItems);

            var ServiceSheetModel = new JSONModel({
                PurchaseOrder: oSelectedCompany.PurchaseOrder,
                ServiceEntrySheetName: oSelectedCompany.ServiceOrder + "_" + oSelectedCompany.DocketNo,
                PostingDate: new Date().toISOString().split("T")[0],
                ApprovalStatus: "20",
                to_ServiceEntrySheetItem: { results: [] }
            });

            sesItems.forEach(function (item, index) {
                ServiceSheetModel.getProperty("/to_ServiceEntrySheetItem/results").push({
                    ServiceEntrySheetItem: (index + 1).toString(),
                    ConfirmedQuantity: item.Quantity,
                    PurchaseOrder: oSelectedCompany.PurchaseOrder,
                    PurchaseOrderItem: item.POItem,
                    ServiceEntrySheetItemDesc: item.Description
                        ? item.Description.length > 40
                            ? item.Description.substring(0, 40)
                            : item.Description
                        : "",
                    ServicePerformanceDate: item.StartDateTime.split('T')[0],
                    ServicePerformanceEndDate: item.EndDateTime.split('T')[0],
                    AccountAssignmentCategory: "R",
                    Service: item.Material,
                    to_AccountAssignment: {
                        results: [
                            {
                                ServiceEntrySheetItem: (index + 1).toString(),
                                AccountAssignment: (index + 1).toString(),
                                ServiceDocumentType: "SVO1",
                                ServiceDocument: oSelectedCompany.ServiceOrder,
                                ServiceDocumentItem: item.ItemNo,
                                GLAccount: "65008300"
                            }
                        ]
                    }
                });
            });
            var oServiceSheet = ServiceSheetModel.getData();

            MessageBox.confirm("Are you sure you want to Process this Details?", {
                title: "Process Confirmation",
                onClose: async function (oAction) {
                    if (oAction !== MessageBox.Action.OK) return;

                    BusyIndicator.show(0);
                    try {
                        let oSESResponse = await new Promise((resolve, reject) => {
                            oModel.create("/A_ServiceEntrySheet", oServiceSheet, {
                                success: resolve,
                                error: reject
                            });
                        });
                        oSelectedCompany.ServiceEntrySheet = oSESResponse.ServiceEntrySheet;
                        await that._updateDocketStatus(oSelectedCompany);
                        viewModel.setProperty("/SESMode", true);
                        that.getView().byId("MOD_id_EditBtn").setVisible(false);
                        BusyIndicator.hide();
                    } catch (err) {
                        BusyIndicator.hide();
                        var errmessage = "";
                        var innerErr = JSON.parse(err.responseText).error.innererror.errordetails[0].message.value;
                        if (innerErr.substr(0, 1) === "{") errmessage = JSON.parse(innerErr).reason.response.body.error.innererror.errordetails[0].message;
                        else errmessage = innerErr;
                        MessageBox.error(errmessage);
                    }
                }
            })

        },
        _updateDocketStatus: async function (oSelectedCompany) {
            const oModel = this.getOwnerComponent().getModel();

            // Determine status based on available fields
            if (oSelectedCompany.ServiceConfirmation && oSelectedCompany.ServiceEntrySheet) {
                oSelectedCompany.Status = "Processed";
            } else if (oSelectedCompany.ServiceConfirmation) {
                oSelectedCompany.Status = "In Process";
            } else if (oSelectedCompany.ServiceEntrySheet) {
                oSelectedCompany.Status = "In Process";
            } else {
                oSelectedCompany.Status = "Process Pending";
            }

            // Perform update
            try {
                await new Promise((resolve, reject) => {
                    oModel.update("/DocketsOCR('" + oSelectedCompany.DocAIID + "')", oSelectedCompany, {
                        success: resolve,
                        error: reject
                    });
                });
                this.getView().getModel("CompanyModel").setProperty("/Status", oSelectedCompany.Status);
                var payload = {
                    ServiceOrder: oSelectedCompany.ServiceOrder,
                    ServiceOrderItem: oSelectedCompany.ServiceOrderItem,
                    Status: `Docket ${oSelectedCompany.Status}`
                };
                oModel.create("/SOIUpdateStatus", { payload: payload }, {
                    success: (oData) => {
                        // assume backend returns an array of results
                        const results = Array.isArray(oData.results) ? oData.results : [];
                        // collect failed items
                        const failedItems = results.filter(r => !r.success).map(r => r.ServiceOrderItem);
                        if (failedItems.length > 0) {
                            const msg = `Failed to update status for item(s): ${failedItems.join(", ")}`;
                            MessageBox.error(msg);
                        }
                    },
                    error: (err) => {
                        const message = err?.responseText || "Update failed";
                        MessageBox.error("Failed to update status: " + message, {
                            details: err
                        });
                    }
                });
            } catch (err) {
                MessageBox.error("Failed to update status in DocketsOCR", {
                    details: err
                });
            }
        },
        onEdit: function () {
            var oView = this.getView();
            var oCompanyModel = oView.getModel("CompanyModel");

            this._backupSelectedCompany = JSON.parse(JSON.stringify(
                oCompanyModel.getProperty("/SelectedCompany")
            ));

            var selectedCompany = oCompanyModel.getProperty("/SelectedCompany");

            selectedCompany.DocketDate = selectedCompany.DocketDate
                ? new Date(selectedCompany.DocketDate)
                : null;

            // Convert StartDateTime and EndDateTime for all items
            selectedCompany.Items.results.forEach((item) => {
                item.StartDateTime = item.StartDateTime ? new Date(item.StartDateTime) : null;
                item.EndDateTime = item.EndDateTime ? new Date(item.EndDateTime) : null;
            });

            oCompanyModel.setProperty("/SelectedCompany", selectedCompany);

            var viewModel = this.getView().getModel("viewModel");
            viewModel.setProperty("/Mode", true);
            viewModel.setProperty("/editMode", true);
            viewModel.setProperty("/inputMode", true);
            viewModel.setProperty("/SESMode", true);

            viewModel.setProperty("/SCFMode", true);
        },

        onCancel: function () {
            var oView = this.getView();
            var oCompanyModel = oView.getModel("CompanyModel");
            var viewModel = this.getView().getModel("viewModel");

            if (this._backupSelectedCompany) {
                oCompanyModel.setProperty("/SelectedCompany",
                    JSON.parse(JSON.stringify(this._backupSelectedCompany))
                );
                this._backupSelectedCompany = null;
            }

            // Disable edit mode
            viewModel.setProperty("/Mode", false);
            viewModel.setProperty("/editMode", false);
            viewModel.setProperty("/inputMode", false);

            var data = oCompanyModel.getProperty("/SelectedCompany")

            var bHasSCF = !!data.ServiceConfirmation;
            var bHasSES = !!data.ServiceEntrySheet;

            viewModel.setProperty("/SCFMode", bHasSCF);
            viewModel.setProperty("/SESMode", bHasSES);
        },

        onRefreshPress: function () {
            this.Datarefresh();
        },
        onAddItemButtonPress: function () {
            var oModel = this.getView().getModel("CompanyModel");
            var aData = oModel.getProperty("/SelectedCompany/Items/results") || [];

            aData.unshift({
                ItemID: "",
                StartDateTime: "",
                EndDateTime: "",
                Description: "",
                Quantity: "",
                ItemNo: oModel.getProperty("/SelectedCompany/ServiceOrderItem").split(",")[0],
                UnPlanned: true
            });

            oModel.setProperty("/SelectedCompany/Items/results", aData);
        },
        POO_onPOTableDelete: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("listItem");
            var oModel = this.getView().getModel("CompanyModel");
            var oData = oModel.getProperty("/SelectedCompany/Items/results");
            var sPath = oSelectedItem.getBindingContext("CompanyModel").getPath();
            var iIndex = parseInt(sPath.split('/')[4]);
            oData.splice(iIndex, 1)
            oModel.setProperty("/SelectedCompany/Items/results", oData);
        },
        onValueHelpRequestItem: function (oEvent) {
            this._currentRowContext = oEvent.getSource().getBindingContext("CompanyModel");
            var oItemContext = oEvent.getSource().getBindingContext("CompanyModel");
            var sItemPath = oItemContext.getPath();
            var sHeaderPath = sItemPath.split("/Items")[0];

            var oHeaderData = this.getView().getModel("CompanyModel").getProperty(sHeaderPath);
            var oModel = this.getOwnerComponent().getModel();

            BusyIndicator.show(0);

            oModel.read("/getProductsFromPO", {
                urlParameters: {
                    PO: oHeaderData.PurchaseOrder
                },
                success: function (oData) {
                    BusyIndicator.hide();

                    const oJSONModel = new JSONModel(oData.results);
                    this.getView().setModel(oJSONModel, "products");

                    if (!this.PD_oDialog) {
                        sap.ui.core.Fragment.load({
                            name: "sap.winslow.ocr.fragment.Product",
                            controller: this,
                        }).then(function (oDialog) {
                            this.PD_oDialog = oDialog;
                            this.getView().addDependent(this.PD_oDialog);
                            this.PD_oDialog.open();
                        }.bind(this));
                    } else {
                        this.PD_oDialog.open();
                    }

                }.bind(this),
                error: function () {
                    BusyIndicator.hide();
                    MessageToast.show("Failed to fetch products");
                }
            });
        },
        Pd_onCloseDialog: function () {
            this.PD_oDialog.close();

        },
        PD_onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query");

            var oBinding = sap.ui.getCore().byId("PD_id_Table").getBinding("items");

            if (!oBinding) return;

            var aFilters = [];
            if (sQuery) {
                aFilters = [
                    new Filter("YY1_SaleProduct_PDI", FilterOperator.Contains, sQuery),
                    new Filter("YY1_SubyProductDescipt_PDI", FilterOperator.Contains, sQuery),
                    // new Filter("PurchaseOrderItemText", FilterOperator.Contains, sQuery),
                ];
                var oCombinedFilter = new Filter({
                    filters: aFilters,
                    and: false
                });
                oBinding.filter(oCombinedFilter);
            } else {
                oBinding.filter([]);
            }
        },
        So_onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query");

            var oBinding = sap.ui.getCore().byId("SO_id_Table").getBinding("items");

            if (!oBinding) return;

            var aFilters = [];
            if (sQuery) {
                aFilters = [
                    new Filter("ServiceOrder", FilterOperator.Contains, sQuery),

                ];
                var oCombinedFilter = new Filter({
                    filters: aFilters,
                    and: false
                });
                oBinding.filter(oCombinedFilter);
            } else {
                oBinding.filter([]);
            }
        },

        PD_onCustomerSelect: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("products");
            if (!oContext) return;
            const oDialog = sap.ui.getCore().byId("Product_id_Dialog");
            oDialog.setBusy(true);
            try {
                var selectedProduct = oContext.getObject().YY1_SaleProduct_PDI;
                var selectedDescription = oContext.getObject().YY1_SubyProductDescipt_PDI;
                var selectedItem = oContext.getObject().PurchaseOrderItem;
                var selectedUnit = oContext.getObject().PurchaseOrderQuantityUnit;
                var selectedMaterial = oContext.getObject().Material;

                var oSelectedCompany = this.getView().getModel("CompanyModel").getProperty("/SelectedCompany");
                var oSOFilter = new Filter("ServiceOrder", FilterOperator.EQ, oSelectedCompany.ServiceOrder);
                var oProductFilter = new Filter("Product", FilterOperator.EQ, selectedProduct);
                var oFinalFilter = new Filter({ filters: [oSOFilter, oProductFilter], and: true });

                this.getOwnerComponent().getModel().read("/A_ServiceOrderItem", {
                    filters: [oFinalFilter],
                    urlParameters: {
                        "$select": "ServiceOrderItem,Product",
                        "$top": "1"
                    },
                    success: function (oData) {
                        var oRowContext = this._currentRowContext;
                        if (oRowContext) {
                            oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemID", selectedProduct);
                            oRowContext.getModel().setProperty(oRowContext.getPath() + "/Description", selectedDescription);
                            oRowContext.getModel().setProperty(oRowContext.getPath() + "/POItem", selectedItem);
                            oRowContext.getModel().setProperty(oRowContext.getPath() + "/QtyUnit", selectedUnit);
                            oRowContext.getModel().setProperty(oRowContext.getPath() + "/Material", selectedMaterial);
                            if (oData.results.length > 0) {
                                oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemNo", oData.results[0].ServiceOrderItem);
                                oRowContext.getModel().setProperty(oRowContext.getPath() + "/UnPlanned", false);
                            } else {
                                oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemNo", oSelectedCompany.ServiceOrderItem.split(",")[0]);
                                oRowContext.getModel().setProperty(oRowContext.getPath() + "/UnPlanned", true);
                            }
                        }
                        oDialog.setBusy(false);
                        if (typeof this.BP_onCloseDialog === "function") this.BP_onCloseDialog();
                    }.bind(this),
                    error: function (oError) {
                        oDialog.setBusy(false);
                        if (typeof this.BP_onCloseDialog === "function") this.BP_onCloseDialog();
                        MessageBox.error("Failed to fetch Service Orders of Selected Product", {
                            details: oError
                        });
                    }.bind(this)
                });
            }
            catch (e) {
                oDialog.setBusy(false);
                MessageBox.error("Failed to Select the Product", {
                    details: e
                });
            }
        },
        So_onCustomerSelect: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("Serviceordermodel");
            if (!oContext) return;

            var selectedServiceOrder = oContext.getObject().ServiceOrder;


            if (this._oInputField) {
                this._oInputField.setValue(selectedServiceOrder);
            }

            if (this.SO_oDialog) {
                this.SO_oDialog.close();
                this.getView().byId("SO_id_Search").setValue("")
            }

        },

        BP_onCloseDialog: function () {
            if (this.PD_oDialog) {
                sap.ui.getCore().byId("PD_id_Search").setValue("");
                var oBinding = sap.ui.getCore().byId("PD_id_Table").getBinding("items");
                if (oBinding) {
                    oBinding.filter([]);
                }
                this.PD_oDialog.close();
                this.PD_oDialog.destroy();
                this.PD_oDialog = null;
            }
        },
        onBeforeRebindTable: function (oEvent) {
            var oView = this.getView();
            var oBindingParams = oEvent.getParameter("bindingParams");

            // --- Expand related entity ---
            oBindingParams.parameters = oBindingParams.parameters || {};
            oBindingParams.parameters.$expand = "Items";

            // --- Filters ---
            var oFilterBar = oView.byId("id_Docket_SmartFilterBar");
            var oFilterData = oFilterBar.getFilterData();

            var aSelectedDivisions = oView.byId("IA_ID_Division").getSelectedKeys() || [];
            var sSelectedStatus = oView.byId("IA_ID_Status").getSelectedKey() || "";
            var oServiceOrderData = oFilterData.ServiceOrder || {};

            aSelectedDivisions = aSelectedDivisions.filter(Boolean);

            var aFilters = [];

            // --- Division Filters ---
            if (aSelectedDivisions.length > 0) {
                var aDivisionFilters = aSelectedDivisions.map(function (div) {
                    return new Filter("Division", "EQ", div);
                });
                aFilters.push(new Filter({
                    filters: aDivisionFilters,
                    and: false
                }));
            }

            // --- Status Filter ---
            if (sSelectedStatus) {
                aFilters.push(new Filter("Status", "EQ", sSelectedStatus));
            }

            // --- Service Order Filter ---
            if (oServiceOrderData.items && oServiceOrderData.items.length > 0) {
                var aServiceOrderFilters = oServiceOrderData.items.map(function (item) {
                    return new Filter("ServiceOrder", "EQ", item.key);
                });
                aFilters.push(new Filter({
                    filters: aServiceOrderFilters,
                    and: false
                }));
            }

            // --- Combine Filters ---
            if (aFilters.length > 0) {
                oBindingParams.filters = [new Filter({ filters: aFilters, and: true })];
            } else {
                oBindingParams.filters = [];
            }

            // --- Sort by modifiedAt desc ---
            oBindingParams.sorter = [new sap.ui.model.Sorter("modifiedAt", true)];

        },
        IA_onSearch: function () {
            var oView = this.getView();
            var oSmartTable = oView.byId("idOpentextlogtable");
            var oInnerTable = oSmartTable.getTable();
            var viewModel = this.getView().getModel("viewModel");


            // Wait until table data is loaded
            oInnerTable.attachEvent("updateFinished", function () {

                var aItems = oInnerTable.getItems();
                if (aItems.length > 0) {
                    var oFirstItem = aItems[0];
                    oInnerTable.setSelectedItem(oFirstItem);

                    // Get the context of the first row
                    var oContext = oFirstItem.getBindingContext();
                    var oData = oContext.getObject();

                    // Set to model

                    // Now get the unique ID and make a read call
                    var sDocAIID = oData.DocAIID; // Assuming DocAIID is your unique ID

                    var oModel = oView.getModel(); // OData model
                    oModel.read("/DocketsOCR('" + sDocAIID + "')", {
                        urlParameters: {
                            "$expand": "Items($orderby=ItemNo asc,ItemID asc)"
                        },
                        success: function (oResult) {

                            // You can set this data to a model property
                            //    var model = new JSONModel(oResult);
                            //   oView.setModel(model, "CompanyModel");
                            oView.getModel("CompanyModel").setProperty("/SelectedCompany", oResult);

                            var bHasSCF = !!oResult.ServiceConfirmation;
                            var bHasSES = !!oResult.ServiceEntrySheet;

                            viewModel.setProperty("/SCFMode", bHasSCF);
                            viewModel.setProperty("/SESMode", bHasSES);

                            viewModel.setProperty("/Mode", false);
                            if (oResult.Status === "Processed" || oResult.Status === "In Process") {
                                viewModel.setProperty("/editMode", true);

                            } else {
                                viewModel.setProperty("/editMode", false);


                            }
                            viewModel.setProperty("/inputMode", false);



                        },
                        error: function (oError) {
                            MessageBox.error("Read call failed:", {
                                details: oError
                            });
                        }
                    });

                }
                else {
                    oView.getModel("CompanyModel").setProperty("/SelectedCompany", null);
                    oInnerTable.removeSelections();
                }
            });

            // Trigger rebind
            oSmartTable.rebindTable();
        }
        ,
        // onBeforeRebindTable: function (oEvent) {
        //     var oView = this.getView();
        //     var oBindingParams = oEvent.getParameter("bindingParams");

        //     // --- Expand Items ---
        //     oBindingParams.parameters = oBindingParams.parameters || {};
        //     oBindingParams.parameters.$expand = "Items";

        //     // --- Filters ---
        //     var oFilterBar = oView.byId("id_Docket_SmartFilterBar");
        //     var oFilterData = oFilterBar.getFilterData();

        //     var aSelectedDivisions = oView.byId("IA_ID_Division").getSelectedKeys() || [];
        //     var sSelectedStatus = oView.byId("IA_ID_Status").getSelectedKey() || "";
        //     var oServiceOrderData = oFilterData.ServiceOrder || {};

        //     aSelectedDivisions = aSelectedDivisions.filter(Boolean);

        //     var aFilters = [];

        //     // Division Filter
        //     if (aSelectedDivisions.length > 0) {
        //         var aDivisionFilters = aSelectedDivisions.map(function (div) {
        //             return new Filter("Division", "EQ", div);
        //         });
        //         aFilters.push(new Filter({ filters: aDivisionFilters, and: false }));
        //     }

        //     // Status Filter
        //     if (sSelectedStatus) {
        //         aFilters.push(new Filter("Status", "EQ", sSelectedStatus));
        //     }

        //     // Service Order Filter
        //     if (oServiceOrderData.items && oServiceOrderData.items.length > 0) {
        //         var aServiceOrderFilters = oServiceOrderData.items.map(function (item) {
        //             return new Filter("ServiceOrder", "EQ", item.key);
        //         });
        //         aFilters.push(new Filter({ filters: aServiceOrderFilters, and: false }));
        //     }

        //     // Combine filters
        //     if (aFilters.length > 0) {
        //         oBindingParams.filters = [new Filter({ filters: aFilters, and: true })];
        //     } else {
        //         oBindingParams.filters = [];
        //     }

        //     // Sort by modifiedAt desc
        //     oBindingParams.sorter = [new sap.ui.model.Sorter("modifiedAt", true)];

        //     // --- Attach first row after filtering ---
        //     var oTable = oEvent.getSource();
        //     oTable.attachEvent("updateFinished", function () {
        //         var aItems = oTable.getItems();
        //         var oCompanyModel = oView.getModel("CompanyModel");

        //         if (aItems.length > 0) {
        //             // Get first row data
        //             var oFirstRowData = aItems[0].getBindingContext().getObject();

        //             // Ensure Items.results exists
        //             if (!oFirstRowData.Items || !oFirstRowData.Items.results) {
        //                 oFirstRowData.Items = { results: oFirstRowData.Items || [] };
        //             }

        //             // Set first filtered row to SelectedCompany
        //             oCompanyModel.setProperty("/SelectedCompany", oFirstRowData);
        //         } else {
        //             oCompanyModel.setProperty("/SelectedCompany", {});
        //         }
        //     });
        // }

        // IA_onSearch: function () {
        //     var oModel = this.getOwnerComponent().getModel();
        //     oModel.read("/DocketsOCR", {
        //         urlParameters: {
        //             "$expand": "Items"
        //         },
        //         success: (data) => {
        //             var filtermodel = new JSONModel(data.results);
        //             this.getView().setModel(filtermodel, "Filtermodel");
        //         },
        //         error: function () {
        //             console.log("Error fetching DocketsOCR data");
        //         }
        //     })

        //     var oView = this.getView();
        //     var oModel = oView.getModel("CompanyModel");

        //     if (!this.allData) {
        //         this.allData = JSON.parse(JSON.stringify(oModel.getData()));
        //     }

        //     var aAllData = this.allData;

        //     // var aSelectedServiceOrders = oView.byId("IA_ID_ServiceOrder").getValue() || [];
        //     var aSelectedDivisions = oView.byId("IA_ID_Division").getSelectedKeys() || [];
        //     var aSelectedStatus = oView.byId("IA_ID_Status").getSelectedKey() || [];


        //     // aSelectedServiceOrders = aSelectedServiceOrders.filter(Boolean);
        //     aSelectedDivisions = aSelectedDivisions.filter(Boolean);


        //     if ( aSelectedDivisions.length === 0 && aSelectedStatus.length === 0) {
        //         oModel.setData(aAllData);
        //         oModel.setProperty("/SelectedCompany", aAllData[0])
        //         return;
        //     }

        //     var aFilteredData = aAllData.filter(function (item) {
        //         // var bServiceOrderMatch =
        //         //     aSelectedServiceOrders.length === 0 ||
        //         //     aSelectedServiceOrders.includes(item.ServiceOrder);

        //         var bDivisionMatch =
        //             aSelectedDivisions.length === 0 ||
        //             aSelectedDivisions.includes(item.Division);

        //         var bStatusMatch =
        //             aSelectedStatus.length === 0 ||
        //             aSelectedStatus.includes(item.Status);

        //         return  bDivisionMatch && bStatusMatch;
        //     });

        //     oModel.setData(aFilteredData);
        //     oModel.setProperty("/SelectedCompany", aFilteredData[0])
        // },

        IA_onPressClear: function () {
            var oSmartFilterBar = this.getView().byId("id_Docket_SmartFilterBar");
            oSmartFilterBar.setFilterData({
                ServiceOrder: null
            }, true);
            var oView = this.getView();
            oView.byId("IA_ID_Division").setSelectedKeys("");

            oView.byId("IA_ID_Status").setSelectedKey("");

        },

        onExpandLeftFullScreen: function () {
            var oFCL = this.byId("fcl");
            var oButton = this.byId("StartExpandBtn");

            if (oFCL.getLayout() === "OneColumn") {
                // Expand to Two Columns
                oFCL.setLayout("TwoColumnsMidExpanded");
                oButton.setIcon("sap-icon://full-screen");

            } else {
                // Collapse back to One Column
                oFCL.setLayout("OneColumn");
                oButton.setIcon("sap-icon://exit-full-screen");

            }
        },

        onToggleMidFullScreen: function () {
            var oFCL = this.byId("fcl");
            var oButton = this.byId("midExpandBtn");

            if (oFCL.getLayout() === "MidColumnFullScreen") {
                oFCL.setLayout("TwoColumnsMidExpanded");
                oButton.setIcon("sap-icon://full-screen");

            } else {
                oFCL.setLayout("MidColumnFullScreen");
                oButton.setIcon("sap-icon://exit-full-screen");


            }
        },
        onValueHelpRequestHeader: function (oEvent) {

            this._oInputField = oEvent.getSource();
            var oModel = this.getOwnerComponent().getModel();

            BusyIndicator.show(0);

            oModel.read("/A_Service", {
                urlParameters: {
                    "$select": "ServiceOrder"
                },
                success: function (oData) {
                    BusyIndicator.hide();

                    const oJSONModel = new JSONModel(oData.results);
                    this.getView().setModel(oJSONModel, "Serviceordermodel");

                    if (!this.SO_oDialog) {
                        sap.ui.core.Fragment.load({
                            name: "sap.winslow.ocr.fragment.Filterbar_Valuehelp",
                            controller: this,
                        }).then(function (oDialog) {
                            this.SO_oDialog = oDialog;
                            this.getView().addDependent(this.SO_oDialog);
                            this.SO_oDialog.open();
                        }.bind(this));
                    } else {
                        this.SO_oDialog.open();
                    }

                }.bind(this),
                error: function () {
                    BusyIndicator.hide();
                    MessageToast.show("Failed to fetch products");
                }
            });
        },
        So_onCloseDialog: function () {
            this.SO_oDialog.close();
        },

        onDocketDateChange: function () {
            const oCompanyModel = this.getView().getModel("CompanyModel");
            const selectedData = oCompanyModel.getProperty("/SelectedCompany");
            this.getOwnerComponent().getModel().read("/getPObyDocketDate", {
                urlParameters: {
                    bpno: selectedData.BPNO,
                    docketDate: selectedData.DocketDate.toISOString().split("T")[0],
                    Division: selectedData.Division
                },
                success: function (oData) {
                    oCompanyModel.setProperty("/SelectedCompany/PurchaseOrder", oData.getPObyDocketDate);
                    this.getPurchaseOrderData(oData.getPObyDocketDate);
                    oCompanyModel?.updateBindings(true);
                }.bind(this),
                error: function (oError) {
                    MessageBox.error("Error fetching PO by Docket Date:", {
                        details: oError
                    });
                }
            });
        },

        onLogoutPress: function () {
            MessageBox.confirm("Are you sure you want to logout?", {
                title: "Confirm Logout",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                emphasizedAction: MessageBox.Action.YES,
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.YES) {
                        sessionStorage.setItem("userIsLoggingOut", "true");
                        setTimeout(function () {
                            window.location.replace("/my/logout");
                        }, 0);
                    }
                }
            });
        },

        onClickSimulate: async function () {
            var isValid = await this.Mandatoryfields();
            if (!isValid) return;

            BusyIndicator.show(0);
            var that = this;
            var oModel = this.getOwnerComponent().getModel();
            var oViewModel = this.getView().getModel("CompanyModel");
            var oSelectedCompany = oViewModel.getProperty("/SelectedCompany");

            // ---------------------------------------------------------
            // 0. HELPER FUNCTIONS
            // ---------------------------------------------------------

            // Helper: Add hours to ISO Date (UTC Safe)
            var fnAddHours = (sISODate, fHours) => {
                if (!sISODate) return null;
                if (fHours > 15) fHours = 15;
                var sTreatAsUTC = sISODate.endsWith("Z") ? sISODate : sISODate + "Z";
                var oDate = new Date(sTreatAsUTC);
                oDate.setTime(oDate.getTime() + (fHours * 60 * 60 * 1000));
                var sISO = oDate.toISOString();
                return sISO.split('.')[0];
            };

            // Helper: Finalize Models and Open Fragment
            var fnFinalize = (aSESItems, aSCItems) => {
                var aFinalSES = aSESItems || JSON.parse(JSON.stringify(docketItems));
                var aFinalSC = aSCItems || JSON.parse(JSON.stringify(docketItems));
                var isSESExtraCol = false;
                var isSCExtraCol = false;
                if (oSelectedCompany.Division === '23' || oSelectedCompany.Division === '22') {
                    isSESExtraCol = aFinalSES.some(oRow => !!oRow.RegionalID);
                    isSCExtraCol = aFinalSC.some(oRow => !!oRow.RegionalID);
                }

                var oSESModel = new JSONModel({ results: aFinalSES, colVis: isSESExtraCol });
                var oSCModel = new JSONModel({ results: aFinalSC, colVis: isSCExtraCol });

                that.getView().setModel(oSESModel, "SESItemsModel");
                that.getView().setModel(oSCModel, "SCItemsModel");
                that.openSimulationFragment();
            };

            // Helper: Get PO Details (Strict - Throws Error)
            var fnGetPODetails = (sPOItems, sProductID) => {
                var oMatch = sPOItems.find(p => p.YY1_SaleProduct_PDI === sProductID);
                if (oMatch) {
                    return {
                        Description: oMatch.YY1_SubyProductDescipt_PDI,
                        Material: oMatch.Material,
                        MaterialDescription: oMatch.PurchaseOrderItemText,
                        POItem: oMatch.PurchaseOrderItem,
                        QtyUnit: oMatch.PurchaseOrderQuantityUnit
                    };
                }
                throw new Error("Product " + sProductID + " not found in PO Items.");
            };

            // Helper: Round to 2 decimals and return as Number (for math)
            var fnRound = (num) => {
                return Math.round((parseFloat(num) + Number.EPSILON) * 100) / 100;
            };

            oModel.read("/getProductsFromPO", {
                urlParameters: { PO: oSelectedCompany.PurchaseOrder },
                success: function (oData) {
                    const poItems = oData.results;
                    this.getView().getModel("viewModel").setProperty("/POItems", poItems);

                    // ---------------------------------------------------------
                    // 1. PRE-CALCULATION
                    // ---------------------------------------------------------
                    var docketItems = JSON.parse(JSON.stringify(oSelectedCompany.Items.results));
                    docketItems.forEach(function (item) {
                        if (item.BreakTimeQty > 0) {
                            item.Quantity = fnRound(item.Quantity - item.BreakTimeQty);
                        }
                        var oMatch = poItems.find(p => p.Material === item.Material);
                        item.MaterialDescription = oMatch.PurchaseOrderItemText;
                    });

                    // ---------------------------------------------------------
                    // 2. FETCH BOOKING DATA (Get Division & Shift)
                    // ---------------------------------------------------------
                    // oModel.read("/ZC_BOOKING_QA", {
                    //     urlParameters: { "$expand": "to_BOOK1" },
                    //     filters: [
                    //         new Filter({
                    //             path: "ServiceOrder",
                    //             operator: FilterOperator.EQ,
                    //             value1: oSelectedCompany.ServiceOrder
                    //         })
                    //     ],
                    //     success: async (oData) => {
                    // const rawData = oData.results || [];
                    // var filters = [];

                    // if (oSelectedCompany.Division === "22") {
                    //     filters = [new Filter("Division", FilterOperator.EQ, oSelectedCompany.Division)];
                    // }
                    // else {
                    //     if (rawData.length > 0) {
                    //         const shiftFound = rawData[0]?.to_BOOK1?.results.find(item => item.Service.toLowerCase().startsWith("non") && item.Question.toLowerCase() === "shift type");
                    //         if (shiftFound) {
                    //             filters = [
                    //                 new Filter("ShiftType", FilterOperator.EQ, shiftFound.Answer),
                    //                 new Filter("Division", FilterOperator.EQ, rawData[0].Division || oSelectedCompany.Division)
                    //             ];
                    //         }
                    //     }
                    // }

                    // if (filters.length === 0) {
                    //     console.log("Simulate: No matching Division/Shift. Using originals.");
                    //     fnFinalize();
                    //     return;
                    // }
                    var filters = [new Filter("Division", FilterOperator.EQ, oSelectedCompany.Division)];

                    // ---------------------------------------------------------
                    // 3. FETCH BILLING RULES (By Division & Shift)
                    // ---------------------------------------------------------
                    this.getOwnerComponent().getModel().read("/ServiceBillingRules", {
                        filters: filters,
                        success: async (oData) => {
                            var billRules = oData.results;
                            if (!billRules || billRules.length === 0) {
                                console.log("Simulate: No Billing Rules found for this Div/Shift. Using originals.");
                                fnFinalize();
                                return;
                            }

                            var aOriginalItems = docketItems;
                            var aSESResultItems = [];
                            var aSCResultItems = [];

                            // ---------------------------------------------------------
                            // 5. FETCH SERVICE ORDER ITEMS (For Unplanned Logic)
                            // ---------------------------------------------------------
                            var oSOFilter = new Filter("ServiceOrder", FilterOperator.EQ, oSelectedCompany.ServiceOrder);

                            this.getOwnerComponent().getModel().read("/A_ServiceOrderItem", {
                                filters: [oSOFilter],
                                urlParameters: { "$select": "ServiceOrderItem,Product" },
                                success: function (oSOData) {
                                    const soItems = oSOData.results || [];
                                    this.getView().getModel("viewModel").setProperty("/SOItems", soItems);

                                    // [NEW] Helper to resolve SO Item & Unplanned Flag
                                    var fnResolveSOItem = (sProductID, sParentItemNo) => {
                                        var oMatch = soItems.find(so => so.Product === sProductID && so.ServiceOrderItem === sParentItemNo);
                                        if (oMatch) {
                                            // Found in SO -> Use new ItemNo, Unplanned = false
                                            return { ItemNo: sParentItemNo, UnPlanned: false };
                                        } else {
                                            // Not found -> Use Parent ItemNo, Unplanned = true
                                            return { ItemNo: sParentItemNo, UnPlanned: true };
                                        }
                                    };

                                    try {
                                        this.getView().getModel("viewModel").setProperty("/Est", []);
                                        if (oSelectedCompany.Division === "22" && aOriginalItems.length > 0 && billRules[0].EstablishmentFeeProduct) {
                                            var itemsForSES = JSON.parse(JSON.stringify(aOriginalItems));
                                            var itemsForSC = JSON.parse(JSON.stringify(aOriginalItems));

                                            var sEService = (billRules[0].EstablishmentFeeService || "").toUpperCase().trim();
                                            var fEstQty = billRules[0].EstablishmentFeeQty ? parseFloat(billRules[0].EstablishmentFeeQty) : 0;
                                            var oED = fnGetPODetails(poItems, billRules[0].EstablishmentFeeProduct);
                                            var docketItem = aOriginalItems[0];

                                            var fnCreateEst = () => {
                                                var oEst = JSON.parse(JSON.stringify(docketItem));
                                                oEst.Quantity = fnRound(fEstQty).toString();
                                                oEst.ItemID = billRules[0].EstablishmentFeeProduct;
                                                oEst.MetroID = billRules[0].EstablishmentFeeProduct;
                                                oEst.RegionalID = billRules[0].RegionalEstFeeProduct;

                                                var oSOInfoE = fnResolveSOItem(billRules[0].EstablishmentFeeProduct, docketItem.ItemNo);
                                                oEst.ItemNo = oSOInfoE.ItemNo;
                                                oEst.UnPlanned = oSOInfoE.UnPlanned;

                                                oEst.StartDateTime = docketItem.StartDateTime;
                                                oEst.EndDateTime = fnAddHours(docketItem.StartDateTime, fEstQty);
                                                oEst.Description = oED.Description; oEst.POItem = oED.POItem; oEst.Material = oED.Material; oEst.MaterialDescription = oED.MaterialDescription; oEst.QtyUnit = billRules[0].EstablishmentFeeUnit || oED.QtyUnit; oEst.CBVal = "Metro";
                                                return oEst;
                                            };
                                            if (sEService === "SERVICE ENTRY" || sEService === "BOTH") itemsForSES.push(fnCreateEst());
                                            if (sEService === "SERVICE CONFIRMATION" || sEService === "BOTH") itemsForSC.push(fnCreateEst());

                                            aSESResultItems = aSESResultItems.concat(itemsForSES);
                                            aSCResultItems = aSCResultItems.concat(itemsForSC);
                                        }
                                        else {
                                            aOriginalItems.forEach(function (docketItem) {
                                                var fRecordedQty = parseFloat(docketItem.Quantity);
                                                var sCurrentProduct = docketItem.ItemID;
                                                var sOriginalStart = docketItem.StartDateTime;
                                                var sCurrentTimeCursor = sOriginalStart;
                                                var aNewItems = [];
                                                var pRule;
                                                if (oSelectedCompany.Division !== "22") pRule = billRules.find(rule => rule.StandardProduct === sCurrentProduct);

                                                if (pRule) {
                                                    // --- RULE MATCHED: Apply Logic ---

                                                    // 1. Min Hours
                                                    if (pRule.MinHours && fRecordedQty < parseFloat(pRule.MinHours)) {
                                                        fRecordedQty = parseFloat(pRule.MinHours);
                                                    }

                                                    // 2. Split Logic Calculation
                                                    var fBaseQty = 0; var fSplit1Qty = 0; var fSplit2Qty = 0; var fRemaining = fRecordedQty;
                                                    if (parseFloat(pRule.Split1Hours) > 0) {
                                                        var fSplit1Limit = parseFloat(pRule.Split1Hours);
                                                        var fSplit2Limit = parseFloat(pRule.Split2Hours) || 99999;
                                                        if (fRemaining > 0) { fBaseQty = Math.min(fRemaining, fSplit1Limit); fRemaining -= fBaseQty; }
                                                        if (fRemaining > 0) { var fNextChunk = fSplit2Limit - fSplit1Limit; fSplit1Qty = Math.min(fRemaining, fNextChunk); fRemaining -= fSplit1Qty; }
                                                        if (fRemaining > 0) { fSplit2Qty = fRemaining; }
                                                    } else {
                                                        fBaseQty = fRecordedQty;
                                                    }

                                                    // 3. Inclement Weather Calculation
                                                    var fInclementQty = parseFloat(docketItem.InclWeatherQty) || 0;
                                                    var fFinalBaseQty = fBaseQty;
                                                    var oInclementPODetails = null;

                                                    if (fInclementQty > 0) {
                                                        // [CHANGE] Use InclWeatherProduct from Reference Table
                                                        if (pRule.InclWeatherProduct) {
                                                            // Deduct from Base
                                                            if (fFinalBaseQty >= fInclementQty) { fFinalBaseQty -= fInclementQty; }
                                                            else { fFinalBaseQty = 0; }

                                                            // [CHANGE] Strict Check for PO Item
                                                            oInclementPODetails = fnGetPODetails(poItems, pRule.InclWeatherProduct);
                                                        }
                                                    }

                                                    // --- ITEM GENERATION ---

                                                    // A. Base Item
                                                    if (fFinalBaseQty > 0) {
                                                        var oBaseItem = JSON.parse(JSON.stringify(docketItem));
                                                        oBaseItem.Quantity = fnRound(fFinalBaseQty).toString();
                                                        oBaseItem.StartDateTime = sCurrentTimeCursor;
                                                        oBaseItem.EndDateTime = fnAddHours(sCurrentTimeCursor, fFinalBaseQty);
                                                        aNewItems.push(oBaseItem);
                                                        sCurrentTimeCursor = oBaseItem.EndDateTime;
                                                    }

                                                    // B. Inclement Weather Item
                                                    if (oInclementPODetails && fInclementQty > 0) {
                                                        var oIncItem = JSON.parse(JSON.stringify(docketItem));
                                                        oIncItem.Quantity = fnRound(fInclementQty).toString();
                                                        oIncItem.ItemID = pRule.InclWeatherProduct; // From Table

                                                        // [NEW] Resolve SO Item & Unplanned
                                                        var oSOInfo = fnResolveSOItem(pRule.InclWeatherProduct, docketItem.ItemNo);
                                                        oIncItem.ItemNo = oSOInfo.ItemNo;
                                                        oIncItem.UnPlanned = oSOInfo.UnPlanned;

                                                        oIncItem.Description = oInclementPODetails.Description;
                                                        oIncItem.POItem = oInclementPODetails.POItem;
                                                        oIncItem.Material = oInclementPODetails.Material;
                                                        oIncItem.MaterialDescription = oInclementPODetails.MaterialDescription;
                                                        oIncItem.QtyUnit = oInclementPODetails.QtyUnit;
                                                        oIncItem.StartDateTime = sCurrentTimeCursor;
                                                        oIncItem.EndDateTime = fnAddHours(sCurrentTimeCursor, fInclementQty);
                                                        aNewItems.push(oIncItem);
                                                        sCurrentTimeCursor = oIncItem.EndDateTime;
                                                    }

                                                    // C. Split 1 Item
                                                    if (fSplit1Qty > 0 && parseFloat(pRule.Split1Hours) > 0) {
                                                        var oD1 = fnGetPODetails(poItems, pRule.Split1Product);
                                                        var oSplit1 = JSON.parse(JSON.stringify(docketItem));
                                                        oSplit1.Quantity = fnRound(fSplit1Qty).toString();
                                                        oSplit1.ItemID = pRule.Split1Product;

                                                        var oSOInfo1 = fnResolveSOItem(pRule.Split1Product, docketItem.ItemNo);
                                                        oSplit1.ItemNo = oSOInfo1.ItemNo;
                                                        oSplit1.UnPlanned = oSOInfo1.UnPlanned;

                                                        oSplit1.Description = oD1.Description; oSplit1.POItem = oD1.POItem; oSplit1.Material = oD1.Material; oSplit1.MaterialDescription = oD1.MaterialDescription; oSplit1.QtyUnit = oD1.QtyUnit;
                                                        oSplit1.StartDateTime = sCurrentTimeCursor;
                                                        oSplit1.EndDateTime = fnAddHours(sCurrentTimeCursor, fSplit1Qty);
                                                        aNewItems.push(oSplit1);
                                                        sCurrentTimeCursor = oSplit1.EndDateTime;
                                                    }

                                                    // D. Split 2 Item
                                                    if (fSplit2Qty > 0 && parseFloat(pRule.Split2Hours) > 0) {
                                                        var oD2 = fnGetPODetails(poItems, pRule.Split2Product);
                                                        var oSplit2 = JSON.parse(JSON.stringify(docketItem));
                                                        oSplit2.Quantity = fnRound(fSplit2Qty).toString();
                                                        oSplit2.ItemID = pRule.Split2Product;

                                                        var oSOInfo2 = fnResolveSOItem(pRule.Split2Product, docketItem.ItemNo);
                                                        oSplit2.ItemNo = oSOInfo2.ItemNo;
                                                        oSplit2.UnPlanned = oSOInfo2.UnPlanned;

                                                        oSplit2.Description = oD2.Description; oSplit2.POItem = oD2.POItem; oSplit2.Material = oD2.Material; oSplit2.MaterialDescription = oD2.MaterialDescription; oSplit2.QtyUnit = oD2.QtyUnit;
                                                        oSplit2.StartDateTime = sCurrentTimeCursor;
                                                        oSplit2.EndDateTime = fnAddHours(sCurrentTimeCursor, fSplit2Qty);
                                                        aNewItems.push(oSplit2);
                                                        sCurrentTimeCursor = oSplit2.EndDateTime;
                                                    }

                                                } else {
                                                    // --- NO RULE MATCHED ---
                                                    var oRawItem = JSON.parse(JSON.stringify(docketItem));
                                                    oRawItem.Quantity = fnRound(fRecordedQty).toString();
                                                    aNewItems.push(oRawItem);
                                                }

                                                var itemsForSES = JSON.parse(JSON.stringify(aNewItems));
                                                var itemsForSC = JSON.parse(JSON.stringify(aNewItems));

                                                // ---------------------------------------------------------
                                                // LOGICS: MEAL, TRAVEL, EST (With SO Item Check)
                                                // ---------------------------------------------------------
                                                if (pRule) {
                                                    // 4. Meal Allowance
                                                    if (fRecordedQty >= 9.5 && pRule.MealAllowanceProduct) {
                                                        var sService = (pRule.MealAllowanceService || "").toUpperCase().trim();
                                                        var oMD = fnGetPODetails(poItems, pRule.MealAllowanceProduct);

                                                        var fnCreateMeal = () => {
                                                            var oMeal = JSON.parse(JSON.stringify(docketItem));
                                                            oMeal.Quantity = "1";
                                                            oMeal.ItemID = pRule.MealAllowanceProduct;

                                                            var oSOInfoM = fnResolveSOItem(pRule.MealAllowanceProduct, docketItem.ItemNo);
                                                            oMeal.ItemNo = oSOInfoM.ItemNo;
                                                            oMeal.UnPlanned = oSOInfoM.UnPlanned;

                                                            oMeal.StartDateTime = docketItem.StartDateTime;
                                                            oMeal.EndDateTime = fnAddHours(docketItem.StartDateTime, 1);
                                                            oMeal.Description = oMD.Description; oMeal.POItem = oMD.POItem; oMeal.Material = oMD.Material; oMeal.MaterialDescription = oMD.MaterialDescription; oMeal.QtyUnit = oMD.QtyUnit;
                                                            return oMeal;
                                                        };
                                                        if (sService === "SERVICE ENTRY" || sService === "BOTH") itemsForSES.push(fnCreateMeal());
                                                        if (sService === "SERVICE CONFIRMATION" || sService === "BOTH") itemsForSC.push(fnCreateMeal());
                                                    }

                                                    // 5. Travel Allowance
                                                    if (pRule.TravelAllowanceProduct) {
                                                        var sTService = (pRule.TravelAllowanceService || "").toUpperCase().trim();
                                                        var oTD = fnGetPODetails(poItems, pRule.TravelAllowanceProduct);

                                                        var fnCreateTravel = () => {
                                                            var oTrav = JSON.parse(JSON.stringify(docketItem));
                                                            oTrav.Quantity = "1";
                                                            oTrav.ItemID = pRule.TravelAllowanceProduct;

                                                            var oSOInfoT = fnResolveSOItem(pRule.TravelAllowanceProduct, docketItem.ItemNo);
                                                            oTrav.ItemNo = oSOInfoT.ItemNo;
                                                            oTrav.UnPlanned = oSOInfoT.UnPlanned;

                                                            oTrav.StartDateTime = docketItem.StartDateTime;
                                                            oTrav.EndDateTime = fnAddHours(docketItem.StartDateTime, 1);
                                                            oTrav.Description = oTD.Description; oTrav.POItem = oTD.POItem; oTrav.Material = oTD.Material; oTrav.MaterialDescription = oTD.MaterialDescription; oTrav.QtyUnit = oTD.QtyUnit;
                                                            return oTrav;
                                                        };
                                                        if (sTService === "SERVICE ENTRY" || sTService === "BOTH") itemsForSES.push(fnCreateTravel());
                                                        if (sTService === "SERVICE CONFIRMATION" || sTService === "BOTH") itemsForSC.push(fnCreateTravel());
                                                    }

                                                    // 6. Establishment Fee
                                                    if (pRule.EstablishmentFeeProduct) {
                                                        var sEService = (pRule.EstablishmentFeeService || "").toUpperCase().trim();
                                                        var fEstQty = pRule.EstablishmentFeeQty ? parseFloat(pRule.EstablishmentFeeQty) : 0;
                                                        var oED = fnGetPODetails(poItems, pRule.EstablishmentFeeProduct);

                                                        var fnCreateEst = () => {
                                                            var oEst = JSON.parse(JSON.stringify(docketItem));
                                                            oEst.Quantity = fnRound(fEstQty).toString();
                                                            oEst.ItemID = pRule.EstablishmentFeeProduct;
                                                            oEst.MetroID = pRule.EstablishmentFeeProduct;
                                                            oEst.RegionalID = pRule.RegionalEstFeeProduct;

                                                            var oSOInfoE = fnResolveSOItem(pRule.EstablishmentFeeProduct, docketItem.ItemNo);
                                                            oEst.ItemNo = oSOInfoE.ItemNo;
                                                            oEst.UnPlanned = oSOInfoE.UnPlanned;

                                                            oEst.StartDateTime = docketItem.StartDateTime;
                                                            oEst.EndDateTime = fnAddHours(docketItem.StartDateTime, fEstQty);
                                                            oEst.Description = oED.Description; oEst.POItem = oED.POItem; oEst.Material = oED.Material; oEst.MaterialDescription = oED.MaterialDescription; oEst.QtyUnit = pRule.EstablishmentFeeUnit || oED.QtyUnit; oEst.CBVal = "Metro";
                                                            return oEst;
                                                        };
                                                        if (sEService === "SERVICE ENTRY" || sEService === "BOTH") itemsForSES.push(fnCreateEst());
                                                        if (sEService === "SERVICE CONFIRMATION" || sEService === "BOTH") itemsForSC.push(fnCreateEst());
                                                    }
                                                }

                                                aSESResultItems = aSESResultItems.concat(itemsForSES);
                                                aSCResultItems = aSCResultItems.concat(itemsForSC);

                                            }); // End Loop
                                        }

                                        fnFinalize(aSESResultItems, aSCResultItems);

                                    } catch (e) {
                                        BusyIndicator.hide();
                                        MessageBox.error(e.message);
                                    }
                                }.bind(this),
                                error: function (oError) {
                                    BusyIndicator.hide();
                                    MessageBox.error("Failed to fetch Service Order Items", {
                                        details: oError
                                    });
                                }
                            });

                        },
                        error: (oError) => {
                            BusyIndicator.hide();
                            MessageBox.error("Failed to fetch Billing Rules", {
                                details: oError
                            });
                        }
                    });
                    //     },
                    //     error: (err) => {
                    //         BusyIndicator.hide();
                    //         MessageBox.error("Failed to fetch Booking QA Data: ", {
                    //             details: err
                    //         });
                    //     }
                    // });

                }.bind(this),
                error: function (oError) {
                    BusyIndicator.hide();
                    MessageBox.error("Failed to fetch PO Items", {
                        details: oError
                    });
                }
            });
        },

        openSimulationFragment: function () {
            const oModel = this.getView().getModel("viewModel")
            if (!this.S_oDialog) {
                sap.ui.core.Fragment.load({
                    name: "sap.winslow.ocr.fragment.Simulate",
                    controller: this,
                }).then(function (oDialog) {
                    this.S_oDialog = oDialog;
                    this.getView().addDependent(this.S_oDialog);
                    this.S_oDialog.open();
                    BusyIndicator.hide();
                }.bind(this));
            } else {
                this.S_oDialog.open();
                BusyIndicator.hide();
            }
            oModel.setProperty("/sesEditMode", false);
            oModel.setProperty("/scEditMode", false);
        },

        S_onCloseDialog: function () {
            this.S_oDialog.close();
            this.getView().getModel("SESItemsModel").setProperty("/", []);
            this.getView().getModel("SCItemsModel").setProperty("/", []);
        },

        onToggleSESEditMode: function () {
            const oModel = this.getView().getModel("viewModel");
            oModel.setProperty("/sesEditMode", !oModel.getProperty("/sesEditMode"));
        },

        onToggleSCEditMode: function () {
            const oModel = this.getView().getModel("viewModel");
            oModel.setProperty("/scEditMode", !oModel.getProperty("/scEditMode"));
        },

        SESEstChange: function (oEvent) {
            this._estchange(oEvent, "SESItemsModel");
        },

        SCEstChange: function (oEvent) {
            this._estchange(oEvent, "SCItemsModel");
        },

        _estchange: function (oEvent, sRowModelName) {
            var oSelect = oEvent.getSource();
            var sSelectedKey = oSelect.getSelectedKey();
            var oRowContext = oSelect.getBindingContext(sRowModelName);
            var oRowModel = oRowContext.getModel();
            var sRowPath = oRowContext.getPath();

            var metroProd = oRowModel.getProperty(sRowPath + "/MetroID");
            var regionalProd = oRowModel.getProperty(sRowPath + "/RegionalID");
            var changeProd = sSelectedKey === 'Metro' ? metroProd : regionalProd;

            var oViewModel = this.getView().getModel("viewModel");
            var aPOItems = oViewModel.getProperty("/POItems");

            var oMatch = aPOItems.find(p => p.YY1_SaleProduct_PDI === changeProd);
            if (oMatch) {
                oRowModel.setProperty(sRowPath + "/ItemID", changeProd);
                oRowModel.setProperty(sRowPath + "/POItem", oMatch.PurchaseOrderItem);
                oRowModel.setProperty(sRowPath + "/Description", oMatch.YY1_SubyProductDescipt_PDI);
                oRowModel.setProperty(sRowPath + "/QtyUnit", oMatch.PurchaseOrderQuantityUnit);
                var sParentItemNo = oRowModel.getProperty(sRowPath + "/ItemNo");
                var aSOItems = oViewModel.getProperty("/SOItems") || [];
                var oMatch = aSOItems.find(function (so) { return so.Product === changeProd && so.ServiceOrderItem === sParentItemNo; });
                if (oMatch) oRowModel.setProperty(sRowPath + "/UnPlanned", false);
                else oRowModel.setProperty(sRowPath + "/UnPlanned", true);
            }
            else {
                MessageBox.error(sSelectedKey + " Product " + changeProd + " not found in PO Items.");
                const switchKey = sSelectedKey === 'Metro' ? 'Regional' : 'Metro';
                oSelect.setSelectedKey(switchKey);
            }
        },
        onDownloadExcel: function () {

            var oModel = this.getOwnerComponent().getModel(); // OData Model
            var oBTN = this.byId("idExcleDownload");
            oBTN.setBusy(true);
            // Call CAPM Action
            oModel.callFunction("/DownloadExcelData", {
                method: "POST",
                success: function (oData) {
                    if (!oData.results || !oData.results.length) return MessageToast.show("No data found");
                    // Excel Columns
                    var aCols = [
                        { label: "SO/Activity No", property: "SO_Activity_No" },
                        { label: "Division", property: "Division" },
                        { label: "BP No", property: "BP_No" },
                        { label: "Docket", property: "Docket" },
                        { label: "Status", property: "Status" },
                        { label: "SES", property: "SES" },
                        { label: "SC", property: "SC" }
                    ];

                    // Create Spreadsheet
                    var oSettings = {
                        workbook: { columns: aCols },
                        dataSource: oData.results,
                        fileName: "ServiceOrderData.xlsx"
                    };

                    var oSheet = new Spreadsheet(oSettings);
                    oSheet.build()
                        .then(function () {
                            MessageToast.show("Download completed");
                        })
                        .finally(function () {
                            oSheet.destroy();
                        });
                    oBTN.setBusy(false);
                }.bind(this),
                error: function () {
                    oBTN.setBusy(false);
                    MessageToast.show("Error while downloading");
                }
            });
        },

        onProductSelectionRequest: function (oEvent) {
            BusyIndicator.show(0);
            this._currentRowContext = oEvent.getSource().getBindingContext("SESItemsModel");
            const po = this.getView().getModel("CompanyModel").getProperty("/SelectedCompany/PurchaseOrder")
            var oModel = this.getOwnerComponent().getModel();
            oModel.read("/getProductsFromPO", {
                urlParameters: {
                    PO: po
                },
                success: function (oData) {
                    BusyIndicator.hide();
                    const oJSONModel = new JSONModel(oData.results);
                    this.getView().setModel(oJSONModel, "products");
                    if (!this.PS_oDialog) {
                        sap.ui.core.Fragment.load({
                            name: "sap.winslow.ocr.fragment.ProductSelection",
                            controller: this,
                        }).then(function (oDialog) {
                            this.PS_oDialog = oDialog;
                            this.getView().addDependent(this.PS_oDialog);
                            this.PS_oDialog.open();
                        }.bind(this));
                    } else {
                        this.PS_oDialog.open();
                    }
                }.bind(this),
                error: function () {
                    BusyIndicator.hide();
                    MessageToast.show("Failed to fetch products");
                }
            });
        },
        PS_onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query");

            var oBinding = sap.ui.getCore().byId("PS_id_Table").getBinding("items");

            if (!oBinding) return;

            var aFilters = [];
            if (sQuery) {
                aFilters = [
                    new Filter("YY1_SaleProduct_PDI", FilterOperator.Contains, sQuery),
                    new Filter("YY1_SubyProductDescipt_PDI", FilterOperator.Contains, sQuery),
                ];
                var oCombinedFilter = new Filter({
                    filters: aFilters,
                    and: false
                });
                oBinding.filter(oCombinedFilter);
            } else {
                oBinding.filter([]);
            }
        },

        PS_onProductSelect: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("products");
            if (!oContext) return;
            const oDialog = sap.ui.getCore().byId("PS_id_Dialog");
            oDialog.setBusy(true);
            try {
                var selectedProduct = oContext.getObject().YY1_SaleProduct_PDI;
                var selectedDescription = oContext.getObject().YY1_SubyProductDescipt_PDI;
                //var selectedItem = oContext.getObject().PurchaseOrderItem;
                var selectedUnit = oContext.getObject().PurchaseOrderQuantityUnit;
                var selectedMaterial = oContext.getObject().Material;
                var selectedMaterialDescription = oContext.getObject().PurchaseOrderItemText;
                var oRowContext = this._currentRowContext;
                if (oRowContext) {
                    oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemID", selectedProduct);
                    oRowContext.getModel().setProperty(oRowContext.getPath() + "/Description", selectedDescription);
                    //oRowContext.getModel().setProperty(oRowContext.getPath() + "/POItem", selectedItem);
                    oRowContext.getModel().setProperty(oRowContext.getPath() + "/QtyUnit", selectedUnit);
                    oRowContext.getModel().setProperty(oRowContext.getPath() + "/Material", selectedMaterial);
                    oRowContext.getModel().setProperty(oRowContext.getPath() + "/MaterialDescription", selectedMaterialDescription);
                }
                oDialog.setBusy(false);
                if (typeof this.PS_onCloseDialog === "function") this.PS_onCloseDialog();

                // var oSelectedCompany = this.getView().getModel("CompanyModel").getProperty("/SelectedCompany");
                // var oSOFilter = new Filter("ServiceOrder", FilterOperator.EQ, oSelectedCompany.ServiceOrder);
                // var oProductFilter = new Filter("Product", FilterOperator.EQ, selectedProduct);
                // var oFinalFilter = new Filter({ filters: [oSOFilter, oProductFilter], and: true });

                // this.getOwnerComponent().getModel().read("/A_ServiceOrderItem", {
                //     filters: [oFinalFilter],
                //     urlParameters: {
                //         "$select": "ServiceOrderItem,Product",
                //         "$top": "1"
                //     },
                //     success: function (oData) {
                //         var oRowContext = this._currentRowContext;
                //         if (oRowContext) {

                //             if (oData.results.length > 0) {
                //                 oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemNo", oData.results[0].ServiceOrderItem);
                //                 oRowContext.getModel().setProperty(oRowContext.getPath() + "/UnPlanned", false);
                //             } else {
                //                 oRowContext.getModel().setProperty(oRowContext.getPath() + "/ItemNo", oSelectedCompany.ServiceOrderItem.split(",")[0]);
                //                 oRowContext.getModel().setProperty(oRowContext.getPath() + "/UnPlanned", true);
                //             }
                //         }
                //         oDialog.setBusy(false);
                //         if (typeof this.BP_onCloseDialog === "function") this.BP_onCloseDialog();
                //     }.bind(this),
                //     error: function (oError) {
                //         oDialog.setBusy(false);
                //         if (typeof this.BP_onCloseDialog === "function") this.BP_onCloseDialog();
                //         MessageBox.error("Failed to fetch Service Orders of Selected Product", {
                //             details: oError
                //         });
                //     }.bind(this)
                // });
            }
            catch (e) {
                oDialog.setBusy(false);
                MessageBox.error("Failed to Select the Product", {
                    details: e
                });
            }
        },

        PS_onCloseDialog: function () {
            if (this.PS_oDialog) {
                sap.ui.getCore().byId("PS_id_Search").setValue("");
                var oBinding = sap.ui.getCore().byId("PS_id_Table").getBinding("items");
                if (oBinding) {
                    oBinding.filter([]);
                }
                this.PS_oDialog.close();
                this.PS_oDialog.destroy();
                this.PS_oDialog = null;
            }
        },

        getPurchaseOrderData: function (sPONumber) {
            if (!sPONumber) {
                this.getView().getModel("viewModel").setProperty("/SupplierDetail", false)
                return
            };
            var oModel = this.getOwnerComponent().getModel(); // OData V2 model
            sap.ui.core.BusyIndicator.show(0);
            oModel.callFunction("/getPOHeader", {
                method: "GET", // function = GET
                urlParameters: {
                    PONumber: sPONumber
                },
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();

                    // var oJSONModel = new sap.ui.model.json.JSONModel(oData.getPOHeader);
                    // this.getView().setModel(oJSONModel, "POHeaderModel");

                    this.getView().getModel("POHeaderModel").setData(oData.getPOHeader)
                    this.getView().getModel("viewModel").setProperty("/SupplierDetail", true)


                }.bind(this),

                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error(oError);
                    sap.m.MessageBox.error("Error fetching PO data");
                }
            });
        },

        getServiceOrderItemData: function (ServiceOrder, ServiceOrderItem) {

            if (!ServiceOrder || !ServiceOrderItem) return;
            sap.ui.core.BusyIndicator.show(0);

            // Main filters
            var aFilters = [];

            // ServiceOrder filter
            aFilters.push(
                new sap.ui.model.Filter(
                    "ServiceOrder",
                    sap.ui.model.FilterOperator.EQ,
                    ServiceOrder
                )
            );

            var aItems = [];

            if (Array.isArray(ServiceOrderItem)) {
                aItems = ServiceOrderItem;
            } else if (typeof ServiceOrderItem === "string") {
                aItems = ServiceOrderItem.split(","); // "10,20,30"
            }

            // Create OR filters
            if (aItems.length > 0) {
                var aItemFilters = aItems.map(function (item) {
                    return new sap.ui.model.Filter(
                        "ServiceOrderItem",
                        sap.ui.model.FilterOperator.EQ,
                        item.trim()
                    );
                });

                var oOrFilter = new sap.ui.model.Filter({
                    filters: aItemFilters,
                    and: false
                });

                aFilters.push(oOrFilter);
            }

            // OData Call
            this.getOwnerComponent().getModel().read("/A_ServiceOrderItem", {
                filters: aFilters,
                success: function (oData) {
                    var oJSONModel = new sap.ui.model.json.JSONModel(oData.results);
                    this.getView().setModel(oJSONModel, "SuppplierModel");

                    sap.ui.core.BusyIndicator.hide();

                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    console.error(oError);
                }
            });
        }
    });
});