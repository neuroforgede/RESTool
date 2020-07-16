import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

import { Popup } from '../popup/popup.comp';
import {
  IConfigInputField,
  IConfigGetSingleMethod,
  IConfigPostMethod,
  IConfigPutMethod,
  ICustomLabels
} from '../../common/models/config.model';
import { FormRow } from '../formRow/formRow.comp';
import { Button } from '../button/button.comp';
import { Loader } from '../loader/loader.comp';
import { dataHelpers } from '../../helpers/data.helpers';
import { fileHelpers } from '../../helpers/file.helpers';
import { IAppContext } from '../app.context';
import { withAppContext } from '../withContext/withContext.comp';

import './formPopup.scss';

const flatten = require('flat');
const unflatten = require('flat').unflatten;

interface IProps {
  context: IAppContext
  title: string
  fields: IConfigInputField[]
  rawData?: any
  getSingleConfig?: IConfigGetSingleMethod
  methodConfig: IConfigPostMethod | IConfigPutMethod
  closeCallback: (reloadData: boolean) => void
  submitCallback: (body: any, containFiles: boolean) => void
}

export const FormPopup = withAppContext(({ context, title, fields, rawData, getSingleConfig, methodConfig, submitCallback, closeCallback }: IProps) => {
  const fieldsCopy: IConfigInputField[] = JSON.parse(JSON.stringify(fields));
  const { httpService, activePage, config } = context;
  const [loading, setLoading] = useState<boolean>(true);
  const [formFields, setFormFields] = useState<IConfigInputField[]>([]);
  const [finalRawData, setFinalRawData] = useState<any>(null);
  const pageHeaders: any = activePage?.requestHeaders || {};
  const customLabels: ICustomLabels | undefined = { ...config?.customLabels, ...activePage?.customLabels };

  async function initFormFields() {
    let finalRawData: any = rawData || {};

    if (getSingleConfig && getSingleConfig.url) {
      try {
        const { url, requestHeaders, actualMethod, dataPath, queryParams } = getSingleConfig;
        const result = await httpService.fetch({
          method: actualMethod || 'get',
          origUrl: url,
          queryParams,
          headers: Object.assign({}, pageHeaders,  requestHeaders || {}),
          rawData,
        });

        const extractedData = dataHelpers.extractDataByDataPath(result, dataPath);

        if (extractedData && typeof extractedData === 'object') {
          finalRawData = extractedData;
        }
      } catch (e) {
        console.error('Could not load single item\'s data.', e);
        toast.error('Could not load single item\'s data.');
      }
    }

    setFinalRawData(finalRawData); // Store the raw data for later.

    const flattenData = flatten(finalRawData || {});

    setFormFields(fieldsCopy.map((field) => {
      let key = field.name;

      field.originalName = field.name;

      if (field.dataPath) {
        key = `${field.dataPath}.${field.name}`;
      }

      // Changing field name to include datapath
      // This will use us later for unflatten the final object
      field.name = key;

      if (dataHelpers.checkIfFieldIsObject(field)) {
        if (flattenData[key] || field.value) {
          field.value = JSON.stringify(flattenData[key] || field.value, null, '  ') || '';
        }
        return field;
      }

      if (field.type === 'array') {
        field.value = flattenData[key] || field.value || [];
        return field;
      }

      if (typeof flattenData[key] !== 'undefined') {
        field.value = flattenData[key];
      } else {
        // important in order to prevent controlled / uncontrolled components error
        field.value = typeof field.value === 'undefined' ? '' : field.value;
      }

      return field;
    }));

    setLoading(false);
  }

  async function submitForm(e: any) {
    e.preventDefault();

    const finalObject: any = (methodConfig as IConfigPutMethod).includeOriginalFields ? Object.assign({}, finalRawData) : {};
    const formData = new FormData();
    const containFiles: boolean = fileHelpers.isMultipartForm(formFields);
    let validationError = null;

    formFields.forEach((field) => {
      if (field.type === 'file') {
        const fileInput: any = document.querySelector(`input[name="${field.name || 'file'}"]`) as HTMLInputElement;

        if (fileInput.files.length > 0) {
          const firstFile = fileInput.files[0];
          formData.append(field.name || 'file', firstFile, firstFile.name);
        }
        return;
      }

      finalObject[field.name] = field.value;

      if (containFiles) {
        formData.append(field.name, field.value);
      }

      if (field.required && field.type !== 'boolean' && !field.value) {
        validationError = 'Please fill up all required fields.';
      }

      if (dataHelpers.checkIfFieldIsObject(field) && field.value) {
        try {
          finalObject[field.name] = JSON.parse(field.value);
        } catch (e) {
          validationError = `Invalid JSON for field "${field.name}".`;
        }
      }

      if (field.type === 'boolean') {
        finalObject[field.name] = field.value || false;
      }

      if (field.type === 'encode') {
        finalObject[field.name] = encodeURIComponent(field.value);
      }
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setLoading(true);

    try {
      const body = containFiles ? formData : unflatten(finalObject);
      await submitCallback(body, containFiles);

      toast.success('Great Success!');

      closeCallback(true);
    } catch (e) {
      toast.error(e.message);
    }

    setLoading(false);
  }

  function formChanged(fieldName: string, value: any) {
    let updatedFormFields: IConfigInputField[] = JSON.parse(JSON.stringify(formFields));

    updatedFormFields = updatedFormFields.map((field: IConfigInputField) => {
      if (field.name === fieldName) {
        field.value = value;
      }

      return field;
    });

    setFormFields(updatedFormFields);
  }

  useEffect(() => {
    initFormFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Popup
      show={true}
      className="form-popup"
      closeCallback={() => closeCallback(false)}
      customLabels={customLabels}
    >
      <React.Fragment>
        <h2>{title}</h2>
        <section>
          {
            loading ?
            <Loader /> :
            <form onSubmit={submitForm}>
              {
                formFields.map((field, idx) => {
                  return (
                    <FormRow
                      key={`field_${idx}`}
                      field={field}
                      onChange={formChanged}
                      showReset={!field.type || field.type === 'text'}
                    />
                  );
                })
              }
              <div className="buttons-wrapper center">
                <Button type="submit" onClick={submitForm} color="green">Submit</Button>
              </div>
            </form>
          }
        </section>
      </React.Fragment>
    </Popup>
  );
});
