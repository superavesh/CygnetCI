

ALTER TABLE einvoice."DocumentStatus"
  ADD COLUMN IF NOT EXISTS "Attempt" SMALLINT STORAGE PLAIN;

ALTER TABLE einvoice."DocumentStatus"
  ADD COLUMN IF NOT EXISTS "IsAttempted" BOOLEAN STORAGE PLAIN;


 DROP FUNCTION IF EXISTS api."InsertCallback"(integer, integer, bigint, uuid, text);

CREATE OR REPLACE FUNCTION api."InsertCallback"(
	"_SubscriberId" integer,
	"_UserId" integer,
	"_BackgroundTaskId" bigint,
	"_RequestId" uuid,
	"_Errors" text)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
BEGIN
	INSERT INTO api."Callbacks"
	(
		"SubscriberId",
		"UserId",
		"BackgroundTaskId",
		"RequestId",
		"Errors",
		"Stamp"
	)
	VALUES
	(
		"_SubscriberId",
		"_UserId",
		"_BackgroundTaskId",
		"_RequestId",
		"_Errors",
		NOW()
	);	
END
$BODY$;

DROP FUNCTION IF EXISTS einvoice."UpdateEsalErrors"(text, bigint);

CREATE OR REPLACE FUNCTION einvoice."UpdateEsalErrors"(
	"_EsalErrors" text,
	"_DocumentId" bigint)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE "_CurrentDate" timestamp without time zone = now();
BEGIN

	UPDATE
		einvoice."DocumentStatus" AS ds
	SET	
		"Errors" = "_EsalErrors",
		"ModifiedStamp" = "_CurrentDate"
	WHERE
		ds."DocumentId" = "_DocumentId";
END
$BODY$;

DROP FUNCTION IF EXISTS einvoice."UpdatePushRequestForGeneration"(bigint[], bigint, smallint, integer);

CREATE OR REPLACE FUNCTION einvoice."UpdatePushRequestForGeneration"(
	"_Ids" bigint[],
	"_BackgroundTaskId" bigint,
	"_PurposeType" smallint,
	"_EInvoicePushStatusInProgress" integer)
    RETURNS TABLE("Id" bigint, "EntityId" integer, "ReturnPeriod" integer, "Type" smallint, "Purpose" integer, "TransactionType" smallint) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
BEGIN
	DROP TABLE IF EXISTS "TempEInvoiceDocumentIds";
	
	CREATE TEMP TABLE IF NOT EXISTS "TempEInvoiceDocumentIds" AS
	SELECT "tempId" FROM UNNEST("_Ids") AS "tempId";
	
	UPDATE
		einvoice."DocumentStatus" AS ds
	SET
		"PushStatus" = "_EInvoicePushStatusInProgress",
		"BackgroundTaskId" = "_BackgroundTaskId",
		"IsAttempted" = true,
		"Errors" = NULL
	FROM
		"TempEInvoiceDocumentIds" AS tedi
	WHERE ds."DocumentId" = tedi."tempId";

	RETURN QUERY 
	SELECT 
		d."Id",
		d."EntityId",
		d."ReturnPeriod",
		--d."Type",
		d."DocumentType" AS "Type",
		d."Purpose" AS "PurposeType",
		d."TransactionType"
	FROM 
		"TempEInvoiceDocumentIds" tedi
		INNER JOIN einvoice."Documents" d ON tedi."tempId" = d."Id"
		--INNER JOIN einvoice."DocumentDW" dw ON tedi."tempId" = dw."Id"
	ORDER BY 
		d."Id";
	
END
$BODY$;

 DROP FUNCTION IF EXISTS einvoice."UpdatePushResponseForGeneration"(einvoice."PushResponseType"[], integer, text, boolean, smallint, smallint, smallint, smallint, smallint);

CREATE OR REPLACE FUNCTION einvoice."UpdatePushResponseForGeneration"(
	"_PushResponse" einvoice."PushResponseType"[],
	"_UserId" integer,
	"_UpdatedByVrn" text,
	"_BitTypeY" boolean,
	"_EInvoicePushStatusGenerated" smallint,
	"_DocumentStatusGenerated" smallint,
	"_DocumentTypeSINV" smallint,
	"_DocumentTypeSDBN" smallint,
	"_DocumentTypeSCRN" smallint)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE "_CurrentDate" timestamp without time zone = now();
BEGIN
	DROP TABLE IF EXISTS "TempEInvoiceStatusDetails";
	
	CREATE TEMP TABLE IF NOT EXISTS "TempEInvoiceStatusDetails"
	(
		"Id" bigint NOT NULL,
		"SignedInvoice" bytea NULL,
		"SignedQRCode" text NULL,
		"EInvoicePushStatus" smallint NOT NULL,
		"EInvoiceIsPushed" boolean NULL,
		"EInvoiceErrors" text NULL,
		"Hash" text,
		"PreviousHash" text
	);
	
	INSERT INTO "TempEInvoiceStatusDetails"
	SELECT
		pr."Id",
		pr."SignedInvoice",
		pr."SignedQRCode",
		pr."EInvoicePushStatus",
		pr."EInvoiceIsPushed",
		pr."EInvoiceErrors",
		pr."Hash",
		pr."PreviousHash"
	FROM
		UNNEST("_PushResponse") AS pr;

	UPDATE
		einvoice."DocumentStatus" AS ds
	SET		
		"PushStatus" = teid."EInvoicePushStatus",
		"PushByUserId" = "_UserId",
		"Errors"= teid."EInvoiceErrors",
		"ModifiedStamp" = "_CurrentDate",
		"IsPushed" = teid."EInvoiceIsPushed",
		"Attempt" = COALESCE("Attempt",0) + 1,
		"IsAttempted" = false
		--"Hash" = teid."Hash",
		--"PreviousHash" = teid."PreviousHash"
	FROM "TempEInvoiceStatusDetails" teid 
	WHERE
		ds."DocumentId" = teid."Id"
		AND teid."EInvoicePushStatus" <> "_EInvoicePushStatusGenerated";

	UPDATE
		einvoice."DocumentStatus" AS ds
	SET
		"IsPushed" = teid."EInvoiceIsPushed", 
		"PushDate" = "_CurrentDate",
		"GeneratedDate" =  "_CurrentDate",
		"PushStatus" = teid."EInvoicePushStatus",
		"Status" = "_DocumentStatusGenerated",
		"PushByUserId" = "_UserId",
		"Errors"= teid."EInvoiceErrors",
		"ModifiedStamp" = "_CurrentDate",
		"Attempt" = COALESCE("Attempt",0) + 1,
		"IsAttempted" = false
		--"Hash" = teid."Hash",
		--"PreviousHash" = teid."PreviousHash"
	FROM "TempEInvoiceStatusDetails" teid 
	WHERE 
		ds."DocumentId" = teid."Id"
		AND teid."EInvoicePushStatus" = "_EInvoicePushStatusGenerated";
	
	IF EXISTS (SELECT 1 FROM einvoice."DocumentSignedDetails" AS ds 
			   				INNER JOIN "TempEInvoiceStatusDetails" teid 
			   					ON ds."DocumentId" = teid."Id")
	THEN
		UPDATE einvoice."DocumentSignedDetails"
			SET "SignedInvoice" = teid."SignedInvoice",
				"SignedQrCode" =  teid."SignedQRCode",
				"Stamp" = "_CurrentDate",
				"IsCompress" = "_BitTypeY"
		FROM "TempEInvoiceStatusDetails" teid
		INNER JOIN einvoice."Documents" doc ON doc."Id" = teid."Id"
		WHERE "DocumentId" = teid."Id"
-- 			AND doc."DocumentType" NOT IN ("_DocumentTypeSINV",
-- 											  "_DocumentTypeSDBN",
-- 											  "_DocumentTypeSCRN")
			AND teid."SignedQRCode" IS NOT NULL;
	ELSE									  
		INSERT INTO einvoice."DocumentSignedDetails"
		(
			"DocumentId",
			"SignedInvoice",
			"SignedQrCode",
			"Stamp",
			"IsCompress"
		)
		SELECT 
			ds."DocumentId",
			teid."SignedInvoice",
			teid."SignedQRCode",
			"_CurrentDate",
			"_BitTypeY"
		FROM 
			einvoice."DocumentStatus" AS ds
			INNER JOIN "TempEInvoiceStatusDetails" teid ON ds."DocumentId" = teid."Id"
			INNER JOIN einvoice."Documents" doc ON doc."Id" = teid."Id"
		WHERE 
-- 			(CASE WHEN doc."DocumentType" IN ("_DocumentTypeSINV",
-- 											  "_DocumentTypeSDBN",
-- 											  "_DocumentTypeSCRN") 
-- 				THEN 
-- 					1 = 1
-- 				ELSE 
-- 					teid."EInvoicePushStatus" = "_EInvoicePushStatusGenerated"
-- 			END)
			teid."EInvoicePushStatus" = "_EInvoicePushStatusGenerated"
			AND teid."SignedQRCode" IS NOT NULL;
END IF;

END
$BODY$;

 DROP FUNCTION IF EXISTS import."SearchErrorDocuments"(integer, integer, integer, text, integer[], smallint, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamp without time zone, timestamp without time zone, smallint);

CREATE OR REPLACE FUNCTION import."SearchErrorDocuments"(
	"_Start" integer,
	"_Size" integer,
	"_SubscriberId" integer,
	"_UserIds" text,
	"_EntityIds" integer[],
	"_ImportType" smallint,
	"_Property1" text,
	"_Property2" text,
	"_Property3" text,
	"_Property4" text,
	"_Property5" text,
	"_Property6" text,
	"_Property7" text,
	"_Property8" text,
	"_Property9" text,
	"_Property10" text,
	"_Property11" text,
	"_Property12" text,
	"_Property13" text,
	"_Property14" text,
	"_Property15" text,
	"_Errors" text,
	"_FromUploadedDate" timestamp without time zone,
	"_ToUploadedDate" timestamp without time zone,
	"_DocumentErrorStatusError" smallint)
    RETURNS TABLE("Id" bigint, "StatisticId" bigint, "SubscriberId" integer, "UserId" integer, "EntityId" integer, "ImportType" smallint, "GroupId" uuid, "Property1" character varying, "Property2" character varying, "Property3" character varying, "Property4" character varying, "Property5" character varying, "Property6" character varying, "Property7" character varying, "Property8" character varying, "Property9" character varying, "Property10" character varying, "Property11" character varying, "Property12" character varying, "Property13" character varying, "Property14" character varying, "Property15" character varying, "Others" character varying, "Errors" character varying, "Status" smallint, "TotalRecord" integer) 
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
    ROWS 1000

AS $BODY$
/* Test Execution:
----------------------------
	SELECT * FROM import."SearchErrorDocuments"
	(0::integer,
	10::integer,
	1::integer,
	null::text,
	null::integer[],
	1::smallint,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::text,
	null::timestamp without time zone,
	null::timestamp without time zone,
	1::smallint);
*/
BEGIN
	DROP TABLE IF EXISTS "TempTblImportErrorIds";
	
	CREATE TEMP TABLE "TempTblImportErrorIds"
	(
		"AutoId" serial,
		"GroupNumber" INT,
		"Checksum" bytea,
		"TotalRecord" integer
	);
	
	CREATE INDEX IDX_TempTblImportErrorIds_GroupID ON "TempTblImportErrorIds"("Checksum");
		  
	INSERT INTO "TempTblImportErrorIds" ("GroupNumber", "Checksum", "TotalRecord")
	SELECT fe."GroupNumber",fe."Checksum",fe."TotalRecord" 
	FROM import."FilterErrorDocuments"(
		"_Start",
		"_Size",
 		"_SubscriberId",
		"_UserIds",
		"_EntityIds",
		"_ImportType",
		"_Property1",
		"_Property2",
		"_Property3",
		"_Property4",
		"_Property5",
		"_Property6",
		"_Property7",
		"_Property8",
		"_Property9",
		"_Property10",
		"_Property11",
		"_Property12",
		"_Property13",
		"_Property14",
		"_Property15",
		"_Errors",
		"_FromUploadedDate",
		"_ToUploadedDate",
		"_DocumentErrorStatusError"
	) as fe;

	RETURN QUERY
	SELECT
		d."Id",
		d."StatisticId",
		d."SubscriberId",
		d."UserId",
		d."EntityId",
		d."ImportType",
		d."GroupId",
		d."Property1",
		d."Property2",
		d."Property3",
		d."Property4",
		d."Property5",
		d."Property6",
		d."Property7",
		d."Property8",
		d."Property9",
		d."Property10",
		d."Property11",
		d."Property12",
		d."Property13",
		d."Property14",
		d."Property15",
		d."Others",
		d."Errors",
		d."Status",
		tiei."TotalRecord"
	FROM
		import."Documents" d
		INNER JOIN "TempTblImportErrorIds" tiei ON tiei."Checksum" = d."Checksum"
	WHERE
		d."Status" = "_DocumentErrorStatusError"
	ORDER BY 
		tiei."AutoId";
END
$BODY$;