import './App.css';
import { bitable, ICell, IFieldMeta, IGridViewProperty, IOpenCellValue, IViewMeta, TableMeta } from "@lark-base-open/js-sdk";
import { Button, Form } from '@douyinfe/semi-ui';
import { BaseFormApi } from '@douyinfe/semi-foundation/lib/es/form/interface';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function App() {
  const [tableMetaList, setTableMetaList] = useState<TableMeta[]>();
  const [message, setMessage] = useState<string>("")
  const [sourceFieldMetaList, setSourceFieldMetaList] = useState<IFieldMeta[]>([]);
  const [sourceViewMetaList, setSourceViewMetaList] = useState<IViewMeta[]>([]);
  const [fieldMetaList, setFieldMetaList] = useState<IFieldMeta[]>([]);

  const [fieldSearchText, setFieldSearchText] = useState<string>('');
  const formApi = useRef<BaseFormApi>();

  const addRecord = useCallback(async ({ sourceTable: sourceTableId, sourceView: sourceViewId, destTable: destTableId, records: recordNumb, fields }: { sourceTable: string, sourceView: string, destTable: string, records: number, fields: [string] }) => {
    // console.log({ sourceTableId, destTableId, records, fields })
    if (sourceTableId) {
      const sourceTable = await bitable.base.getTableById(sourceTableId);
      const sourceFieldMetaList = await sourceTable.getFieldMetaList();
      let ValidSourceMetaList = sourceFieldMetaList.filter(field => fields.includes(field.id));
      // const viewMetaList = await sourceTable.getViewMetaList();
      // const viewMeta = viewMetaList[0];
      const viewMeta = await sourceTable.getViewMetaById(sourceViewId);

      //tìm các field tương ứng ở bảng đích 
      setMessage('Preparing')
      const destTable = await bitable.base.getTableById(destTableId);
      const destFieldMetas = await destTable.getFieldMetaList();


      //tìm các field trùng tên và gán vào 1 bảng mapping tên nguồn và tên đích
      const fieldMapping: Record<string, string | undefined> = {};
      ValidSourceMetaList.forEach(function(field) {
        const destField = destFieldMetas.find(destField => destField.name === field.name);
        console.log({ destField })
        fieldMapping[field.id] = destField?.id;
      })
      function getTextValue(cellValue: any): any {
        // console.log({ cellValue });
        if (Array.isArray(cellValue)) {
          let first = cellValue[0];
          if (first?.type === 'text') {
            return first.text;
          } else {
            return first;
          }
        } else return cellValue?.toString();
      }
      // console.log({ fieldMapping, ValidSourceMetaList })
      ///lấy số record đầu tiên
      let validRecordNumb = recordNumb || 100;
      // sourceTable.getRecordList()
      const view = await sourceTable.getViewById(sourceViewId);
      const records = (await view.getVisibleRecordIdList(viewMeta.property?.filterInfo, viewMeta.property?.sortInfo)).slice(0, validRecordNumb);
      // console.log({ viewRecords })
      // const records = (await sourceTable.getRecordIdList(undefined, `["Ngày tạo đơn DESC"]`)).slice(0, validRecordNumb);
      // const records = await sourceTable.getRecordIdList();
      // console.log({ totalRecord: records.length })
      //just get the top records value to compare
      let groupedData: Record<string, boolean> = {};//có cấu trúc dạng key,value là mảng các group record

      // const formula = `Nguồn đơn hàng = ["Facebook"]`;

      // //read all record from destination table to compare value
      const destRecordIdList = await destTable.getRecordIdList();
      // const destRecordList =  destRecordIdList.map(id=> await destTable.getRecordById(id))
      let destRecordList = [];
      for (const record of destRecordIdList) {
        let recordData = (await destTable.getRecordById(record)).fields;
        destRecordList.push(recordData);
      };
      // console.log({ destIdLength: destRecordIdList.length, destRecordList })
      let index = 0;
      for (const record of records) {
        index++;
        let recordData = await sourceTable.getRecordById(record);
        let recordValue = recordData.fields;
        // console.log(`adding record ${index}`)
        const groupKey = fields.map(field => getTextValue(recordValue[field])).join("-");
        //kiểm tra key tương ứng ở bảng đích
        const existed = destRecordList.find(destRecordValue => {
          const destGroupKey = fields.map(sourceId => {
            const destId = fieldMapping[sourceId];
            // console.log({ sourceId, destId, destRecordValue })
            if (destId) {
              return getTextValue(destRecordValue[destId]);
            } else return "";
          }).join("-");
          // console.log({ destGroupKey })
          return destGroupKey == groupKey;
        });
        // console.log({ existed, groupKey })
        if (!groupedData[groupKey] && !existed) {
          // 
          // console.log({ dataValue })
          groupedData[groupKey] = true;
          //add vào table mới

          let newData: Record<string, any> = {}
          fields.forEach(function(field) {
            let value = recordValue[field];
            let destId = fieldMapping[field];
            if (destId) {
              newData[destId] = value;
            }
          });
          // console.log({ newData })
          //tiếp tục kiểm tra giá trị tương ứng ở destinationRecord

          await destTable.addRecord({
            fields: newData
          })
        }
        setMessage(`processing ${index}/${records.length} records`);

      }
      setMessage("DONE");
    } else {
      setMessage("not found source table");
    }
  }, []);

  async function onSourceTableChange(sourceTableId: string) {
    // console.log({ sourceTableId })
    const sourceTable = await bitable.base.getTableById(sourceTableId);
    // console.log({ sourceTable })
    const viewMetaList = await sourceTable.getViewMetaList(); // Get the view meta information list of talbe
    setFieldMetaList([]);
    setSourceViewMetaList(viewMetaList);
  }

  async function onSourceViewChange(sourceViewId: string) {
    const formData = formApi.current?.getValues();
    const sourceTableId = formData?.sourceTable;
    const sourceTable = await bitable.base.getTableById(sourceTableId);
    const view = await sourceTable.getViewById(sourceViewId);
    const fieldMetas = await view.getFieldMetaList()
    // console.log({ fieldMetas })
    setSourceFieldMetaList(fieldMetas);
  }

  async function onDestTableChange(destTableId: string) {
    const destTable = await bitable.base.getTableById(destTableId);
    const destFieldMetas = await destTable.getFieldMetaList();

    //xử lý lại danh sách sourceFieldMetaList
    let newFieldMetaList: IFieldMeta[] = [];
    destFieldMetas.forEach(function(destField) {
      const sourceField = sourceFieldMetaList.find(sourceField => sourceField.name === destField.name && (destField.type <= 18));
      if (sourceField) {
        newFieldMetaList.push(sourceField)
      }
    })
    setFieldMetaList(newFieldMetaList);
  }

  useEffect(() => {
    Promise.all([bitable.base.getTableMetaList(), bitable.base.getSelection()])
      .then(([metaList, selection]) => {
        setTableMetaList(metaList);
        // console.log({ metaList, selection })
        formApi.current?.setValues({ table: selection.tableId });
      });
  }, []);

  return (
    <main className="main">
      <h4>
        Copy <code>Grouped field value</code> into new Table
      </h4>
      <Form labelPosition='top' onSubmit={addRecord} getFormApi={(baseFormApi: BaseFormApi) => formApi.current = baseFormApi}>
        <Form.Slot label="Development guide">
          <div>
            <ul>
              <li>
                1. Select source table
              </li>
              <li>
                2. Select destination table
              </li>
              <li>
                3. Select grouped fields (name should be the same as the field name in destination table))
              </li>
              <li>
                4. Click "Add Record"
              </li>
            </ul>
            {/* <a href="https://lark-technologies.larksuite.com/docx/HvCbdSzXNowzMmxWgXsuB2Ngs7d" target="_blank"
              rel="noopener noreferrer">
              Select source table
            </a> */}

          </div>
        </Form.Slot>
        <Form.Slot label="API">
          <div style={{ width: "100%", display: "flex" }}>
            <a href="telegram:0394093333" target="_blank"
              rel="noopener noreferrer">
              Contact me on Telegram: @dungnt118
            </a>
          </div>
        </Form.Slot>

        <Form.Select field='sourceTable'
          label='Select Source Table'
          placeholder="Please select source Table"
          style={{ width: '100%' }}
          onChange={val => onSourceTableChange(val)}
        >
          {
            Array.isArray(tableMetaList) && tableMetaList.map(({ name, id }) => {
              return (
                <Form.Select.Option key={id} value={id}>
                  {name}
                </Form.Select.Option>
              );
            })
          }
        </Form.Select>

        <Form.Select field='sourceView'
          label='Select Source View'
          placeholder="Please select source View"
          style={{ width: '100%' }}
          onChange={val => onSourceViewChange(val)}
        >
          {
            Array.isArray(sourceViewMetaList) && sourceViewMetaList.map(({ name, id }) => {
              return (
                <Form.Select.Option key={id} value={id}>
                  {name}
                </Form.Select.Option>
              );
            })
          }
        </Form.Select>

        <Form.Select field='destTable'
          label='Select Destination Table'
          placeholder="Please select destination Table"
          style={{ width: '100%' }}
          onChange={val => onDestTableChange(val)}
        >
          {
            Array.isArray(tableMetaList) && tableMetaList.map(({ name, id }) => {
              return (
                <Form.Select.Option key={id} value={id}>
                  {name}
                </Form.Select.Option>
              );
            })
          }
        </Form.Select>

        <Form.Select field='fields'
          label='Select grouped fields'
          placeholder="Please select grouped fields"
          style={{ width: '100%' }}
          multiple={true}
          showClear={true}
          showArrow={true}
          autoClearSearchValue={true}
          onSearch={(text) => {
            console.log({ text })
            setFieldSearchText(text)
          }}
          onChange={values => console.log({ values })}
        >
          {
            Array.isArray(fieldMetaList) && fieldMetaList.filter(item => item.name.includes(fieldSearchText)).map(({ name, id }) => {
              return (
                <Form.Select.Option key={id} value={id}>
                  {name}
                </Form.Select.Option>
              );
            })
          }
        </Form.Select>

        <Form.InputNumber field='records'
          label="number of record"
          defaultValue={100}
          initValue={100}
          placeholder="enter the number of sample for grouped." style={{ width: "100%" }}
        />

        <Button theme='solid' htmlType='submit'>Add Record</Button>
        <Form.Slot label="State">
          <div style={{ width: "100%", display: "flex" }}>
            {message}
          </div>
        </Form.Slot>
      </Form>
    </main>
  )
}