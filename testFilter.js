const records = [{ product: undefined, location: '', comment: '' }];
try {
  records.filter(record => 
    record.product.toLowerCase().includes(''.toLowerCase())
  );
  console.log("No error");
} catch(e) {
  console.error("Filter Error:", e.message);
}
