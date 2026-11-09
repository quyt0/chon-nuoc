// Danh sách STK. Muốn thêm/sửa thì sửa file này rồi push; trên web không ai sửa được.
export const BANKS = {
  MB: { name: 'MBBank', bin: '970422' },
  TCB: { name: 'Techcombank', bin: '970407' },
  TPB: { name: 'TPBank', bin: '970423' },
  VCB: { name: 'Vietcombank', bin: '970436' },
  HDB: { name: 'HDBank', bin: '970437' },
};

export const ACCOUNTS = {
  'duy-cuyt': {
    holder: 'DOÃN DUY PHÚC',
    list: [
      { bank: 'MB', no: '5553230405' },
      { bank: 'TCB', no: '102420484069' },
    ],
  },
  'minh-tuan': {
    holder: 'NGUYỄN MINH TUẤN',
    list: [
      { bank: 'TPB', no: '00000172025' },
      { bank: 'TPB', no: '3368882005' },
      { bank: 'VCB', no: '1033237906' },
      { bank: 'MB', no: '922939896789' },
      { bank: 'MB', no: '260990899898' },
      { bank: 'TCB', no: '88611122005' },
      { bank: 'TCB', no: '19051012181013' },
    ],
  },
  'le-hanh': {
    holder: 'LÊ LƯƠNG HẠNH',
    list: [
      { bank: 'TCB', no: '8886886626' },
      { bank: 'HDB', no: '0886886626' },
    ],
  },
  'duong-thuy': {
    holder: 'ĐỖ NHẬT THUỲ DƯƠNG',
    list: [
      { bank: 'MB', no: '8518012005' },
    ],
  },
  'mai-anh': {
    holder: 'CÙ THỊ MAI ANH',
    list: [
      { bank: 'MB', no: '8301300405' },
      { bank: 'TCB', no: '8896058686' },
    ],
  },
};
